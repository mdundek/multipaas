const DBController = require('../db/index');
const OSController = require('../os/index');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

const TaskRuntimeController = require('./tasks.runtime');
const TaskGlusterController = require('./tasks.gluster');
const TaskVolumeController = require('./tasks.volume');
const TaskServicesController = require('./tasks.services');
const TaskAppsController = require('./tasks.apps');
const TaskNginxController = require('./tasks.nginx');

const NGinxController = require("../nginx/index");

class TaskController {

    /**
     * init
     */
    static init(mqttController) {
        (async () => {
            this.mqttController = mqttController;

            TaskRuntimeController.init(this, mqttController);
            TaskGlusterController.init(this, mqttController);
            TaskServicesController.init(this, mqttController);
            TaskVolumeController.init(this, mqttController);
            TaskAppsController.init(this, mqttController);
            TaskNginxController.init(this, mqttController);

            setInterval(() => {
                this.maintenance();
            }, 10 * 60 * 1000); // Every 10 minutes
            setInterval(() => {
                this.processPendingTasks();
            }, 1 * 60 * 1000); // Every 1 minute

            // TODO: Remove in production, this is here to facilitate developement
            setTimeout(() => {
                this.processPendingTasks();
            }, 5 * 1000);
        })();
    }

    /**
     * maintenance
     */
    static maintenance(){
        // TODO: 

        // Get all tasks that are IN_PROGRESS updated > 30 minutes
        // 2 scenarios: 
        //   Host-Node crashed in middle of IN_PROGRESS
        //   Task-Controller crashed in middle of IN_PROGRESS
        //
        // In both cases of IN_PROGRESS, we add update the task by
        //    adding error log to task
        //    change it's status to ERROR
    }

    /**
     * processPendingTasks
     * @param {*} taskId 
     */
    static processPendingTasks(taskId){
        (async() => {
            let taskList = [];
            try{
                if(taskId != undefined){
                    let task = await DBController.getTask(taskId);
                    if(task && task.status == "PENDING") {
                        taskList.push(task);
                    }
                } else {
                    taskList = await DBController.getPendingTasks();
                }
            } catch(err) {
                console.log("ERROR retrieving task(s) =>", err);
            }

            for(let i=0; i<taskList.length; i++) {
                if(this.bussyTaskIds.indexOf(taskList[i].id) == -1) {
                    try{
                        this.bussyTaskIds.push(taskList[i].id);
                        if(taskList[i].taskType == "CREATE-K8S-CLUSTER") {
                            await TaskRuntimeController.initiateK8sCluster(taskList[i]);
                        } else if(taskList[i].taskType == "DEPROVISION-WORKSPACE-RESOURCES") {
                            await this.deprovisionWorkspaceResources(taskList[i]);
                        } else if(taskList[i].taskType == "UPDATE-K8S-CLUSTER") {
                            await this.updateK8sCluster(taskList[i]);
                        } else if(taskList[i].taskType == "PROVISION-VOLUME") {
                            await this.provisionVolume(taskList[i]);
                        } else if(taskList[i].taskType == "DEPROVISION-VOLUME") {
                            await this.deprovisionVolume(taskList[i]);
                        } else if(taskList[i].taskType == "BIND-VOLUME") {
                            await this.bindVolume(taskList[i]);
                        } else if(taskList[i].taskType == "UNBIND-VOLUME") {
                            await this.unbindVolume(taskList[i]);
                        } else if(taskList[i].taskType == "PROVISION-SERVICE") {
                            await this.provisionService(taskList[i]);
                        } else if(taskList[i].taskType == "DEPROVISION-SERVICE") {
                            await this.deprovisionService(taskList[i]);
                        } else if(taskList[i].taskType == "DEPLOY-IMAGE") {
                            await this.deployAppImage(taskList[i]);
                        } else if(taskList[i].taskType == "DELETE-IMAGE") {
                            await this.deleteAppImage(taskList[i]);
                        }
                    } catch(err) {
                        console.log("ERROR processing task", taskList[i], "=>", err);                        
                    } finally {
                        this.bussyTaskIds.splice(this.bussyTaskIds.indexOf(taskList[i].id), 1);
                    }
                }
            }
        })();
    }

    /**
     * takeClusterSnapshot
     * @param {*} workspaceId 
     */
    static async takeClusterSnapshot(workspaceId) {
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let snapshotResults = [];
        for(let i=0; i<workspaceK8SNodes.length; i++) {
            let host = allK8SHosts.find(h => h.id == workspaceK8SNodes[i].k8sHostId);
            let response = await this.mqttController.queryRequestResponse(host.ip, "take_node_snapshot", {
                "node": workspaceK8SNodes[i]
            }, 60 * 1000 * 15);
           
            if(response.data.status == 200) {
                snapshotResults.push({
                    node: workspaceK8SNodes[i],
                    host: host,
                    snapshot: response.data.snapshot
                });
            } else {
                const error = new Error(response.data.message);
                error.code = response.data.status;
                throw error;
            }
        }
        return snapshotResults;
    }

    /**
     * restoreClusterSnapshot
     * @param {*} workspaceId 
     * @param {*} nodesAndSnapshotIds 
     */
    static async restoreClusterSnapshot(snapshotData) {
        for(let i=0; i<snapshotData.length; i++) {
            if(snapshotData[i].node.nodeType == "MASTER"){
                await this.mqttController.queryRequestResponse(snapshotData[i].host.ip, "restore_node_snapshot", snapshotData[i], 60 * 1000 * 10);
            } else {
                this.mqttController.client.publish(`/mycloud/k8s/host/query/${snapshotData[i].host.ip}/restore_node_snapshot`, JSON.stringify(snapshotData[i]));
            }
        }
    }

    /**
     * cleanUpClusterSnapshot
     * @param {*} snapshotData 
     */
    static async cleanUpClusterSnapshot(snapshotData) {
        for(let i=0; i<snapshotData.length; i++) {
            this.mqttController.client.publish(`/mycloud/k8s/host/query/${snapshotData[i].host.ip}/delete_node_snapshot`, JSON.stringify(snapshotData[i]));
        }
    }

    /**
     * collectMemoryFromNetwork
     */
    static async collectMemoryFromNetwork() {
        let memArray = await this.mqttController.collectRequestResponse("/mycloud/k8s/host/query/k8s_nodes/free_memory");
        memArray.sort(( a, b ) => {
            if ( a.memory < b.memory ){
                return -1;
            }
            if ( a.memory > b.memory ){
                return 1;
            }
            return 0;
        });
        memArray.reverse();
        return memArray;
    }

    /**
     * collectDiskSpaceFromGlusterNetwork
     */
    static async collectDiskSpaceFromGlusterNetwork() {
        let sizeArray = await this.mqttController.collectRequestResponse("/mycloud/k8s/host/query/gluster_peers/free_disk_size");
        sizeArray.sort(( a, b ) => {
            if ( a.glusterVolumeCount < b.glusterVolumeCount ){
                return -1;
            }
            if ( a.glusterVolumeCount > b.glusterVolumeCount ){
                return 1;
            }
            return 0;
        });
        return sizeArray;
    }

    /**
     * collectDiskSpaceFromK8SNetwork
     */
    static async collectDiskSpaceFromK8SNetwork() {
        let sizeArray = await this.mqttController.collectRequestResponse("/mycloud/k8s/host/query/k8s_nodes/free_disk_size");
        sizeArray.sort(( a, b ) => {
            if ( a.glusterVolumeCount < b.glusterVolumeCount ){
                return -1;
            }
            if ( a.glusterVolumeCount > b.glusterVolumeCount ){
                return 1;
            }
            return 0;
        });
        return sizeArray;
    }

    /**
     * deprovisionWorkspaceResources
     * @param {*} task 
     */
    static async deprovisionWorkspaceResources(task) {
        task.payload = JSON.parse(task.payload);
        // TODO
    }
    
    /**
     * updateK8sCluster
     * @param {*} task 
     */
    static async updateK8sCluster(task) {
        task.payload = JSON.parse(task.payload);
        let updateFlags = task.payload[0].flags;

        if(updateFlags.scale != undefined && updateFlags.scale != null){

            this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

            let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(task.targetId);
            let allK8SHosts = await DBController.getAllK8sHosts();

            let memArray = await this.collectMemoryFromNetwork();
            await TaskRuntimeController.registerMissingK8SHosts(allK8SHosts, memArray);
           
            let workerNodes = workspaceK8SNodes.filter(n => n.nodeType == "WORKER");
            let masterNodes = workspaceK8SNodes.filter(n => n.nodeType == "MASTER");
            let workerNodesProfiles = workerNodes.map(wn => {
                return {
                    "node": wn, 
                    "host": allK8SHosts.find(h => h.id == wn.k8sHostId)
                }
            });
            let masterNodesProfiles = masterNodes.map(mn => {
                return {
                    "node": mn, 
                    "host": allK8SHosts.find(h => h.id == mn.k8sHostId)
                }
            });

            // ================ SCALE DOWN TO 1 NODE ONLY (The developement configuration) ==================
            if(updateFlags.scale == 1 && workerNodes.length > 0) {
                await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                    "type":"INFO",
                    "step":"SCALE_DOWN",
                    "component": "task-controller",
                    "ts":new Date().toISOString()
                });
                try{
                    await TaskRuntimeController.scaleDownK8SClusterNodes(task.payload[0].socketId, masterNodesProfiles, workerNodesProfiles, true);
                    await DBController.updateTaskStatus(task, "DONE", {
                        "type":"INFO",
                        "step":"SCALE_DOWN",
                        "component": "task-controller",
                        "ts":new Date().toISOString()
                    });
                } catch(err) {
                    this.mqttController.logEvent(task.payload[0].socketId, "error", "Could not scale down cluster");
                    await DBController.updateTaskStatus(task, "ERROR", {
                        "type":"ERROR",
                        "step":"SCALE_DOWN",
                        "component": "task-controller",
                        "message": (err.code ? err.code : "500") + ": " + (err.message ? err.message : "Unexpected error"),
                        "ts":new Date().toISOString()
                    });
                } finally {
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                }
            } 
            // ================ SCALE UP TO X WORKERS, NO WORKERS YET ==================
            // ================ SCALE UP TO X WORKERS, HAVE WORKERS ALREADY ==================
            else if((updateFlags.scale > 1 && workerNodes.length == 0) ||
                    (updateFlags.scale > 1 && workerNodes.length > 0 && updateFlags.scale > workerNodes.length)) {
                await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                    "type":"INFO",
                    "step":"SCALE_UP",
                    "component": "task-controller",
                    "ts":new Date().toISOString()
                });
                let usableMemTargets = memArray.filter(h => h.memory > 3000);
                if(usableMemTargets.length > 0){
                    try{
                        await TaskRuntimeController.scaleUpK8SCluster(task.payload[0].socketId, task.targetId, (workerNodes.length == 0) ? 0 : workerNodes.length, usableMemTargets, workerNodesProfiles, masterNodesProfiles, updateFlags, allK8SHosts);
                        await DBController.updateTaskStatus(task, "DONE", {
                            "type":"INFO",
                            "step":"SCALE_UP",
                            "component": "task-controller",
                            "ts":new Date().toISOString()
                        });
                    } catch(err) {
                        console.log(err);
                        this.mqttController.logEvent(task.payload[0].socketId, "error", "Could not scale up cluster");
                        await DBController.updateTaskStatus(task, "ERROR", {
                            "type":"ERROR",
                            "step":"SCALE_UP",
                            "component": "task-controller",
                            "message": (err.code ? err.code : "500") + ": " + (err.message ? err.message : "Unexpected error"),
                            "ts":new Date().toISOString()
                        });
                    } finally {
                        this.mqttController.closeEventStream(task.payload[0].socketId);
                    }
                } else {
                    this.mqttController.logEvent(task.payload[0].socketId, "error", "No more hosts with sufficient memory available to provision workers on");
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                    await DBController.updateTaskStatus(task, "ERROR", {
                        "type":"ERROR",
                        "step":"SCALE_UP",
                        "component": "task-controller",
                                                "message":"No more hosts with sufficient memory available to provision workers on",
                        "ts":new Date().toISOString()
                    });
                    this.mqttController.client.publish('/mycloud/alert/out_of_resources/k8s_host_memory');
                }        
            } 
            // ================ SCALE DOWN TO X WORKERS, HAVE WORKERS ALREADY ==================
            else if(updateFlags.scale > 1 && workerNodes.length > 0 && updateFlags.scale < workerNodes.length) {
                await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                    "type":"INFO",
                    "step":"SCALE_DOWN",
                    "component": "task-controller",
                                        "ts":new Date().toISOString()
                });
                try{
                    // Need to deprovision workerNodes by "workerNodes.length - updateFlags.scale"
                    let toDeprovisionCount = workerNodes.length - updateFlags.scale;

                    let deproWorkers = [];
                    for(let i=0; i<toDeprovisionCount; i++){
                        deproWorkers.push(workerNodesProfiles[i]);
                    }
                    await TaskRuntimeController.scaleDownK8SClusterNodes(task.payload[0].socketId, masterNodesProfiles, deproWorkers);

                    await DBController.updateTaskStatus(task, "DONE", {
                        "type":"INFO",
                        "step":"SCALE_DOWN",
                        "component": "task-controller",
                                                "ts":new Date().toISOString()
                    });
                } catch(err) {
                    this.mqttController.logEvent(task.payload[0].socketId, "error", "Could not scale down cluster");
                    await DBController.updateTaskStatus(task, "ERROR", {
                        "type":"ERROR",
                        "step":"SCALE_DOWN",
                        "component": "task-controller",
                                                "message": (err.code ? err.code : "500") + ": " + (err.message ? err.message : "Unexpected error"),
                        "ts":new Date().toISOString()
                    });
                } finally {
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                }
            } else {
                this.mqttController.logEvent(task.payload[0].socketId, "info", "Nothing to update");
                this.mqttController.closeEventStream(task.payload[0].socketId);

                // Target is already in place, nothing to do. Just update task status
                await DBController.updateTaskStatus(task, "DONE", {
                    "type":"INFO",
                    "step":"NO_ACTION",
                    "component": "task-controller",
                                        "message":"as-is / to-be are the same",
                    "ts":new Date().toISOString()
                });
            }   
        }
    }

    /**
     * provisionVolume
     * @param {*} task 
     */
    static async provisionVolume(task) {
        task.payload = JSON.parse(task.payload);
        // GLUSTER
        let snapshotData = null;
        if(task.payload[0].params.type == "gluster"){
            try {
                this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

                await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                    "type": "INFO",
                    "step": "PROVISIONING_GLUSTER_VOLUME",
                    "component": "task-controller",
                                        "ts": new Date().toISOString()
                });

                snapshotData = await this.takeClusterSnapshot(task.targetId);

                this.mqttController.logEvent(task.payload[0].socketId, "info", "Provisioning Gluster volume");
                await TaskGlusterController.provisionVolume(task.targetId, task.id, task.payload[0].params.size, task.payload[0].params.replicas, task.payload[0].params.name, task.payload[0].params.type);
    
                await this.cleanUpClusterSnapshot(snapshotData);
                
                await DBController.updateTaskStatus(task, "DONE", {
                    "type": "INFO",
                    "step": "PROVISIONING_GLUSTER_VOLUME",
                    "component": "task-controller",
                                        "ts": new Date().toISOString()
                });
            } catch (err) {
                this.mqttController.logEvent(task.payload[0].socketId, "error", "An error occured while provisionning Gluster volume, rollback");
                if(snapshotData){
                    await this.restoreClusterSnapshot(snapshotData);
                }

                await DBController.updateTaskStatus(task, "ERROR", {
                    "type": "ERROR",
                    "step": "PROVISIONING_GLUSTER_VOLUME",
                    "component": "task-controller",
                                        "message": err.message ? err.message : "Could not create gluster volume",
                    "ts": new Date().toISOString()
                });
            } finally {
                this.mqttController.closeEventStream(task.payload[0].socketId);
            }
        } 
        // LOCAL VOLUME
        else if(task.payload[0].params.type == "local"){
            try {
                this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

                await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                    "type":"INFO",
                    "step":"PROVISIONNING_PV_VOLUME",
                    "component": "task-controller",
                                        "ts":new Date().toISOString()
                });

                // Create volume DB entry
                this.mqttController.logEvent(task.payload[0].socketId, "info", "Creating volume");
                await TaskVolumeController.declareLocalVolume(task.targetId, task.payload[0].params.name, task.payload[0].params.size, task.payload[0].params.type);

                await DBController.updateTaskStatus(task, "DONE", {
                    "type":"INFO",
                    "step":"PROVISIONNING_PV_VOLUME",
                    "component": "task-controller",
                                        "ts":new Date().toISOString()
                });   
            } catch (error) {
                console.log("ERROR 4 => ", error);
                this.mqttController.logEvent(task.payload[0].socketId, "error", "An error occured while provisionning volume, rollback");
                
                await DBController.updateTaskStatus(task, "ERROR", {
                    "type":"ERROR",
                    "step":"PROVISIONNING_PV_VOLUME",
                    "component": "task-controller",
                                        "message": error.message,
                    "ts":new Date().toISOString()
                });
            } finally {
                this.mqttController.closeEventStream(task.payload[0].socketId);
            }
            // await this.bindVolume(task);
        } else {
            this.mqttController.logEvent(task.payload[0].socketId, "error", "Provisioning volume type that does not exist: " + task.payload[0].params.type);
            console.error("Provisioning volume type that does not exist: " + task.payload[0].params.type);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"PROVISIONNING_VOLUME",
                "component": "task-controller",
                                "message": "Unsupported volume type " + task.payload[0].params.type,
                "ts":new Date().toISOString()
            });
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * provisionService
     * @param {*} task 
     */
    static async provisionService(task) {
        task.payload = JSON.parse(task.payload);
        // let snapshotData = null;
        try {
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"PROVISIONNING_SERVICE",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            });

            // Take cluster snapshot
            // snapshotData = await this.takeClusterSnapshot(task.targetId);

            if(task.target == "workspace"){
                // console.log("SIZE =>", task.payload[0].params.pvcSize);
                await TaskServicesController.provisionServiceToTenantWorkspace(
                    task.payload[0].socketId,
                    task.targetId, 
                    task.payload[0].params.ns, 
                    task.payload[0].params.serviceLabel, 
                    task.payload[0].params.service, 
                    task.payload[0].params.overwriteConfigFile, 
                    task.payload[0].params.serviceParams, 
                    task.payload[0].params.instanceName,
                    task.payload[0].params.exposeService,
                    task.payload[0].params.volumeName,
                    // task.payload[0].params.targetPv,
                    task.payload[0].params.pvcSize,
                    task.payload[0].params.domainId
                );
            } else {
                // TODO: Not implemented yet, will become usefull when deployment on global service cluster is requested rather than workspace cluster
                throw new Error("Provisioning service target not implemented yet");
            }
           
            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"PROVISIONNING_SERVICE",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            }); 

            // await this.cleanUpClusterSnapshot(snapshotData);
        } catch (error) {
            console.log("ERROR 5 => ", error);
            // if(snapshotData){
            //     await this.restoreClusterSnapshot(snapshotData);
            // }
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"PROVISIONNING_SERVICE",
                "component": "task-controller",
                                "message": error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * deprovisionVolume
     * @param {*} task 
     */
    static async deprovisionVolume(task) {
        task.payload = JSON.parse(task.payload);
        let snapshotData = null;
        try {
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DEPROVISIONNING_VOLUME",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            });

            if(task.payload[0].params.type == "gluster"){
                snapshotData = await this.takeClusterSnapshot(task.targetId);
                await TaskGlusterController.deprovisionVolume(task.payload[0].socketId, task.payload[0].params.volumeId, task.payload[0].params.volumeName, task.payload[0].params.volumeSecret);
                await this.cleanUpClusterSnapshot(snapshotData);
                this.mqttController.closeEventStream(task.payload[0].socketId);
            } else if(task.payload[0].params.type == "local"){
                snapshotData = await this.takeClusterSnapshot(task.targetId);
                await TaskVolumeController.detatchAndUnmountLocalVolumeFromClusterVMs(task.payload[0].socketId, task.payload[0].params.workspaceId, task.payload[0].params.volumeId);
                await TaskVolumeController.deleteLocalVolumeFromClusterVMs(task.payload[0].socketId, task.payload[0].params.workspaceId, task.payload[0].params.volumeId);
                await DBController.removeVolume(task.payload[0].params.volumeId);
                await this.cleanUpClusterSnapshot(snapshotData);
                this.mqttController.closeEventStream(task.payload[0].socketId);
            } else {
                this.mqttController.logEvent(task.payload[0].socketId, "error", "Only gluster and local volumes can be deprovisioned");
                await DBController.updateTaskStatus(task, "ERROR", {
                    "type":"ERROR",
                    "step":"DEPROVISIONNING_VOLUME PREFLIGHT CHECKS",
                    "component": "task-controller",
                                        "message":"Only gluster and local volumes can be deprovisioned",
                    "ts":new Date().toISOString()
                });
                this.mqttController.closeEventStream(task.payload[0].socketId);
                return;
            } 
            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DEPROVISIONNING_VOLUME",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            if(snapshotData){
                await this.restoreClusterSnapshot(snapshotData);
            }
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DEPROVISIONNING_VOLUME",
                "component": "task-controller",
                                "message":error.message,
                "ts":new Date().toISOString()
            });
            this.mqttController.closeEventStream(task.payload[0].socketId);
        } 
    }

    /**
     * deprovisionService
     * @param {*} task 
     */
    static async deprovisionService(task) {
        task.payload = JSON.parse(task.payload);
        let snapshotData = null;
        let volume = null;
        let restoreVolumeDb = false;
        let backupNginxHttpConfig = null;
        let backupNginxTcpConfig = null;
        try {
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DEPROVISIONNING_SERVICE",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            });

            let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(task.payload[0].params.service.workspaceId);
            let allK8SHosts = await DBController.getAllK8sHosts();
            let masterNode = workspaceK8SNodes.find(n => n.nodeType == "MASTER");
            let masterHost = allK8SHosts.find(o => o.id == masterNode.k8sHostId);
            // Deprovision K8S volume resources
            // snapshotData = await this.takeClusterSnapshot(task.targetId);

            let dbService = await DBController.getService(task.payload[0].params.service.id);
            let serviceRoutes = await DBController.getServiceRoutes(task.payload[0].params.service.id);

            this.mqttController.logEvent(task.payload[0].socketId, "info", "Uninstalling service");
            await TaskServicesController.uninstallService(dbService, masterHost, masterNode);
            
            // await this.cleanUpClusterSnapshot(snapshotData);
            snapshotData = null;

            if(dbService.hasDedicatedVolume) {
                this.mqttController.logEvent(task.payload[0].socketId, "info", "Unmounting dedicated volume from cluster nodes");
                // Delete volume entry from DB
                volume = await DBController.getVolume(dbService.volumeId);
                await TaskVolumeController.detatchAndUnmountLocalVolumeFromClusterVMs(task.payload[0].socketId, task.payload[0].params.service.workspaceId, dbService.volumeId);
                await DBController.removeVolume(volume.id);
                restoreVolumeDb = true;
            }

            await DBController.removeService(dbService.id);

            let org = await DBController.getOrgForWorkspace(task.payload[0].params.service.workspaceId);
            let account = await DBController.getAccountForOrg(org.id);
            let workspace = await DBController.getWorkspace(task.payload[0].params.service.workspaceId);

            this.mqttController.logEvent(task.payload[0].socketId, "info", "Updating NGinx configuration");

            backupNginxHttpConfig = await NGinxController.deleteHttpConfigServersForVirtualPorts(serviceRoutes, account.name, org.name, workspace.name, dbService.instanceName);
            backupNginxTcpConfig = await NGinxController.deleteTcpConfigServersForVirtualPorts(serviceRoutes, account.name, org.name, workspace.name, dbService.instanceName);

            this.mqttController.logEvent(task.payload[0].socketId, "info", "Updating ingress controller");

            await TaskNginxController.updateConfigAndIngress(dbService.workspaceId, dbService.namespace, masterHost, masterNode, workspaceK8SNodes, task.payload[0].params.serviceConfig);

            this.mqttController.logEvent(task.payload[0].socketId, "info", "Updating cluster Pod Presets");

            await TaskServicesController.updateClusterPodPresets(dbService.workspaceId, dbService.namespace, masterHost, masterNode);
            
            // Update DB
            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DEPROVISIONNING_SERVICE",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            });  
        } catch (error) {
            console.log("ERROR 6 => ", error);
            this.mqttController.logEvent(task.payload[0].socketId, "error", "Error while deleting service, rollback");
            // if(snapshotData){
            //     await this.restoreClusterSnapshot(snapshotData);
            // }
           
            if(restoreVolumeDb){
                await DBController.createVolume(
                    volume.size, 
                    volume.name, 
                    volume.secret, 
                    volume.workspaceId, 
                    volume.type, 
                    volume.portIndex
                );
            }

            if(backupNginxHttpConfig){
                await NGinxController.restoreHttpConfig(backupNginxHttpConfig);
            }
            if(backupNginxTcpConfig){
                await NGinxController.restoreTcpConfig(backupNginxTcpConfig);
            }
                       
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DEPROVISIONNING_SERVICE",
                "component": "task-controller",
                                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * bindVolume
     * @param {*} task 
     */
    static async bindVolume(task) {
        task.payload = JSON.parse(task.payload);
        let snapshotData = null;
        if(task.payload[0].params.bindTo == "k8s") {
            try {
                this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

                await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                    "type":"INFO",
                    "step":"BIND_VOLUME",
                    "component": "task-controller",
                                        "ts":new Date().toISOString()
                });
                if(task.payload[0].params.volume.type == "gluster") {
                    snapshotData = await this.takeClusterSnapshot(task.targetId);
                    await TaskRuntimeController.mountGlusterVolumeToClusterVMs(task.payload[0].socketId, task.targetId, task.payload[0].params.volume);
                    await TaskVolumeController.addVolumeBindingToDb(task.targetId, task.payload[0].params.volume.id, task.payload[0].params.bindTo == "k8s" ? "workspace" : "vm");
                    await this.cleanUpClusterSnapshot(snapshotData);
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                } else if(task.payload[0].params.volume.type == "local") {
                    snapshotData = await this.takeClusterSnapshot(task.targetId);
                    await TaskVolumeController.attachAndMountLocalVolumeToClusterVMs(task.payload[0].socketId, task.targetId, task.payload[0].params.volume);
                    await TaskVolumeController.addVolumeBindingToDb(task.targetId, task.payload[0].params.volume.id, task.payload[0].params.bindTo == "k8s" ? "workspace" : "vm");
                    await this.cleanUpClusterSnapshot(snapshotData);
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                } else {
                    await DBController.updateTaskStatus(task, "ERROR", {
                        "type":"ERROR",
                        "step":"VOLUME BINDING PREFLIGHT CHECKS",
                        "component": "task-controller",
                                                "message":"Only gluster & local volumes can be unbound from k8s",
                        "ts":new Date().toISOString()
                    });
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                    return;
                }
                
                await DBController.updateTaskStatus(task, "DONE", {
                    "type":"INFO",
                    "step":"BIND_VOLUME",
                    "component": "task-controller",
                                        "ts":new Date().toISOString()
                }); 
            } catch (error) {
                console.log(error);
                this.mqttController.logEvent(task.payload[0].socketId, "error", "An error occured while binding volume to cluster");
                if(snapshotData){
                    await this.restoreClusterSnapshot(snapshotData);
                }
                await DBController.updateTaskStatus(task, "ERROR", {
                    "type":"ERROR",
                    "step":"BIND_VOLUME",
                    "component": "task-controller",
                                        "message":error.message,
                    "ts":new Date().toISOString()
                });
                this.mqttController.closeEventStream(task.payload[0].socketId);
            }
        } else {
            // TODO: other targets are VM, to implement
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"BIND_VOLUME PREFLIGHT CHECKS",
                "component": "task-controller",
                                "message":"VMs are not implemented yet",
                "ts":new Date().toISOString()
            });
            this.mqttController.logEvent(task.payload[0].socketId, "error", "VMs are not implemented yet");
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * unbindVolume
     * @param {*} task 
     */
    static async unbindVolume(task) {
        task.payload = JSON.parse(task.payload);
        let snapshotData = null;
        if(task.payload[0].params.unbindFrom == "k8s") {
            try {
                this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");
                await DBController.updateTaskStatus(task,"IN_PROGRESS", {
                    "type":"INFO",
                    "step":"UNBIND_VOLUME",
                    "component": "task-controller",
                                        "ts":new Date().toISOString()
                });

                if(task.payload[0].params.volume.type == "gluster") {
                    snapshotData = await this.takeClusterSnapshot(task.targetId);
                    await TaskRuntimeController.unmountGlusterVolumeFromClusterVMs(task.payload[0].socketId, task.targetId, task.payload[0].params.volume);
                    await TaskVolumeController.removeVolumeBindingFromDb(task.targetId, task.payload[0].params.volume.id, task.payload[0].params.unbindFrom == "k8s" ? "workspace" : "vm");
                    await this.cleanUpClusterSnapshot(snapshotData);
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                } else if(task.payload[0].params.volume.type == "local") {
                    snapshotData = await this.takeClusterSnapshot(task.targetId);
                    await TaskVolumeController.detatchAndUnmountLocalVolumeFromClusterVMs(task.payload[0].socketId, task.targetId, task.payload[0].params.volume.id);
                    await TaskVolumeController.removeVolumeBindingFromDb(task.targetId, task.payload[0].params.volume.id, task.payload[0].params.unbindFrom == "k8s" ? "workspace" : "vm");
                    await this.cleanUpClusterSnapshot(snapshotData);
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                } else {
                    await DBController.updateTaskStatus(task, "ERROR", {
                        "type":"ERROR",
                        "step":"VOLUME UNBINDING PREFLIGHT CHECKS",
                        "component": "task-controller",
                                                "message":"Only gluster & local volumes can be unbound from k8s",
                        "ts":new Date().toISOString()
                    });
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                    return;
                }
                await DBController.updateTaskStatus(task, "DONE", {
                    "type":"INFO",
                    "step":"UNBIND_VOLUME",
                    "component": "task-controller",
                                        "ts":new Date().toISOString()
                });   
            } catch (error) {
                if(snapshotData){
                    await this.restoreClusterSnapshot(snapshotData);
                }
                await DBController.updateTaskStatus(task,"ERROR", {
                    "type":"ERROR",
                    "step":"VOLUME UNBINDING",
                    "component": "task-controller",
                                        "message":error.message,
                    "ts":new Date().toISOString()
                });
                this.mqttController.closeEventStream(task.payload[0].socketId);
            }
        } else {
            // TODO: other targets are VM, to implement
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"VOLUME UNBINDING PREFLIGHT CHECKS",
                "component": "task-controller",
                                "message":"VMs are not implemented yet",
                "ts":new Date().toISOString()
            });
            this.mqttController.logEvent(task.payload[0].socketId, "error", "VMs are not implemented yet");
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * deployAppImage
     * @param {*} task 
     */
    static async deployAppImage(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DEPLOY_IMAGE",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            });

            await TaskAppsController.buildImage(task.payload[0].socketId, task.targetId, task.payload[0].params.appZipPath, task.payload[0].params.image, task.payload[0].params.version);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DEPLOY_IMAGE",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DEPLOY_IMAGE",
                "component": "task-controller",
                                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * deleteAppImage
     * @param {*} task 
     */
    static async deleteAppImage(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DELETE_IMAGE",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            });

            await TaskAppsController.deleteImage(task.targetId, task.payload[0].params.image);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DELETE_IMAGE",
                "component": "task-controller",
                                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DELETE_IMAGE",
                "component": "task-controller",
                                "message":error.message,
                "ts":new Date().toISOString()
            });
        }
    }
}


TaskController.pendingResponses = {};
TaskController.bussyTaskIds = [];
module.exports = TaskController;