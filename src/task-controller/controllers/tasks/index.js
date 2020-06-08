const DBController = require('../db/index');
const DHCPController = require('../dhcp/index');
const TaskRuntimeController = require('./tasks.runtime');
const TaskGlusterController = require('./tasks.gluster');
const TaskVolumeController = require('./tasks.volume');
const TaskServicesController = require('./tasks.services');
const TaskAppsController = require('./tasks.apps');
const TaskNginxController = require('./tasks.nginx');
const TaskKeycloakController = require('./tasks.keycloak');
const Keycloak = require('../keycloak/index');

const YAML = require('yaml');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

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
            TaskKeycloakController.init(this, mqttController);

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
                console.error(err);
            }

            for(let i=0; i<taskList.length; i++) {
                if(this.bussyTaskIds.indexOf(taskList[i].id) == -1) {
                    try{
                        this.bussyTaskIds.push(taskList[i].id);
                        if(taskList[i].taskType == "DEPROVISION-ORGANIZATION") {
                            await this.processScheduledDeprovisionOrganization(taskList[i]);
                        } else if(taskList[i].taskType == "DEPROVISION-WORKSPACE-RESOURCES") {
                            await this.processScheduledDeprovisionWorkspaceResources(taskList[i]);
                        } else if(taskList[i].taskType == "CREATE-K8S-CLUSTER") {
                            await TaskRuntimeController.processScheduledInitiateK8sCluster(taskList[i]);
                        } else if(taskList[i].taskType == "CREATE-KEYCLOAK-WS-GROUPS") {
                            await TaskKeycloakController.processScheduledCreateGroups(taskList[i]);
                        } else if(taskList[i].taskType == "CLEANUP-KEYCLOAK-WS-GROUPS") {
                            await TaskKeycloakController.processScheduledCleanupGroups(taskList[i]);
                        } else if(taskList[i].taskType == "UPDATE-K8S-CLUSTER") {
                            await TaskRuntimeController.processScheduledUpdateK8sCluster(taskList[i]);
                        } else if(taskList[i].taskType == "PROVISION-VOLUME") {
                            await TaskVolumeController.processScheduledProvisionVolume(taskList[i]);
                        } else if(taskList[i].taskType == "DEPROVISION-VOLUME") {
                            await TaskVolumeController.processScheduledDeprovisionVolume(taskList[i]);
                        } else if(taskList[i].taskType == "BIND-VOLUME") {
                            await TaskVolumeController.processScheduledBindVolume(taskList[i]);
                        } else if(taskList[i].taskType == "UNBIND-VOLUME") {
                            await TaskVolumeController.processScheduledUnbindVolume(taskList[i]);
                        } else if(taskList[i].taskType == "PROVISION-SERVICE") {
                            await TaskServicesController.processScheduledProvisionService(taskList[i]);
                        } else if(taskList[i].taskType == "DEPROVISION-SERVICE") {
                            await TaskServicesController.processScheduledDeprovisionService(taskList[i]);
                        } else if(taskList[i].taskType == "DEPLOY-IMAGE") {
                            await TaskAppsController.processScheduledDeployAppImage(taskList[i]);
                        } else if(taskList[i].taskType == "DELETE-IMAGE") {
                            await TaskAppsController.processScheduledDeleteAppImage(taskList[i]);
                        } else if(taskList[i].taskType == "PROVISION-APPLICATION") {
                            await TaskAppsController.processScheduleProvisionApplication(taskList[i]);
                        } else if(taskList[i].taskType == "SCALE-APPLICATION") {
                            await TaskAppsController.processScheduleScaleApplication(taskList[i]);
                        } else if(taskList[i].taskType == "PROVISION-APPLICATION-VERSION") {
                            await TaskAppsController.processScheduleProvisionApplicationVersion(taskList[i]);
                        } else if(taskList[i].taskType == "REPLACE-APPLICATION-VERSION") {
                            await TaskAppsController.processScheduleReplaceApplicationVersion(taskList[i]);
                        } else if(taskList[i].taskType == "DEPROVISION-APPLICATION") {
                            await TaskAppsController.processScheduleDeprovisionApplication(taskList[i]);
                        } else if(taskList[i].taskType == "CANARY-SPLIT_APPLICATION") {
                            await TaskAppsController.processScheduleApplicationCanarySplit(taskList[i]);
                        } else if(taskList[i].taskType == "BIND_PROXY-DOMAIN") {
                            await TaskRuntimeController.processScheduledBindProxyDomain(taskList[i]);
                        } else if(taskList[i].taskType == "UNBIND_PROXY-DOMAIN") {
                            await TaskRuntimeController.processScheduledUnbindProxyDomain(taskList[i]);
                        }
                    } catch(err) {
                        console.error("ERROR processing task", taskList[i], "=>", err);                        
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
                this.mqttController.client.publish(`/multipaas/k8s/host/query/${snapshotData[i].host.ip}/restore_node_snapshot`, JSON.stringify(snapshotData[i]));
            }
        }
    }

    /**
     * cleanUpClusterSnapshot
     * @param {*} snapshotData 
     */
    static async cleanUpClusterSnapshot(snapshotData) {
        for(let i=0; i<snapshotData.length; i++) {
            this.mqttController.client.publish(`/multipaas/k8s/host/query/${snapshotData[i].host.ip}/delete_node_snapshot`, JSON.stringify(snapshotData[i]));
        }
    }

    /**
     * collectMemoryFromNetwork
     */
    static async collectMemoryFromNetwork() {
        let memArray = await this.mqttController.collectRequestResponse("/multipaas/k8s/host/query/k8s_nodes/free_memory");
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
        let sizeArray = await this.mqttController.collectRequestResponse("/multipaas/k8s/host/query/gluster_peers/free_disk_size");
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
     * processScheduledDeprovisionOrganization
     * @param {*} task 
     */
    static async processScheduledDeprovisionOrganization(task) {
        task.payload = JSON.parse(task.payload);

        try {
            let remainingWss = await DBController.getWorkspacesForOrg(task.targetId);
            if(remainingWss.length == 0){
                // Only once all workspaces have been deprovisioned, we delete this organization
                await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                    "type": "INFO",
                    "step": "DEPROVISION-ORGANIZATION",
                    "component": "task-controller",
                    "ts": new Date().toISOString()
                });

                // Delete Organization DB entry
                await DBController.deleteOrganization(task.targetId);
                            
                await DBController.updateTaskStatus(task, "DONE", {
                    "type": "INFO",
                    "step": "DEPROVISION-ORGANIZATION",
                    "component": "task-controller",
                    "ts": new Date().toISOString()
                });
            }
        } catch (error) {
            await DBController.updateTaskStatus(task, "ERROR", {
                "type": "ERROR",
                "step": "DEPROVISION-ORGANIZATION",
                "component": "task-controller",
                "message": error.message ? error.message : "Could not deprovision k8s cluster",
                "ts": new Date().toISOString()
            });
        }
    }

    /**
     * processScheduledDeprovisionWorkspaceResources
     * @param {*} task 
     */
    static async processScheduledDeprovisionWorkspaceResources(task) {
        task.payload = JSON.parse(task.payload);
        let collectIps = [];
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type": "INFO",
                "step": "DEPROVISION-WORKSPACE",
                "component": "task-controller",
                "ts": new Date().toISOString()
            });

            // Look up all gluster volumes provisioned & deprovision them from the Gluster network
            let allGlusterVolumeIds = task.payload[0].params.glusterVolumeIds;
            for(let i=0; i<allGlusterVolumeIds.length; i++) {
                let volumeGlusterHosts = await DBController.getGlusterHostsByVolumeId(allGlusterVolumeIds[i]);
                await this.mqttController.queryRequestResponse(volumeGlusterHosts[0].ip, "deprovision_gluster_volume", {
                    "volumeId": allGlusterVolumeIds[i]
                }, 60 * 1000 * 15);
            }

            // Halt and destroy all VMs
            // Delete workspace base folder
            // Return leased IPs
            let allNodesAndHosts = task.payload[0].params.k8sNodes;
            let workerNodes = allNodesAndHosts.filter(n => n.nodeType == "WORKER");
            let masterNodes = allNodesAndHosts.filter(n => n.nodeType == "MASTER");
            for(let i=0; i<workerNodes.length; i++) {
                collectIps.push(workerNodes[i].ip);
                await TaskRuntimeController.deprovisionK8SWorker(
                    masterNodes[0],
                    masterNodes[0].k8s_host,
                    workerNodes[i], 
                    workerNodes[i].k8s_host
                );
            }

            for(let i=0; i<masterNodes.length; i++) {
                collectIps.push(masterNodes[i].ip);
                await TaskRuntimeController.deprovisionK8SMaster(
                    masterNodes[i],
                    masterNodes[i].k8s_host
                );
            }

            // Remove cluster roles from keycloak for this workspace
            try {
                let org = await DBController.getOrgForWorkspace(task.payload[0].params.k8sNodes[0].workspaceId);
                let ws = await DBController.getWorkspace(task.payload[0].params.k8sNodes[0].workspaceId);
                let acc = await DBController.getAccountForOrg(org.id);

                await this.schedule(
                    "CLEANUP-KEYCLOAK-WS-GROUPS",
                    "workspace",
                    task.targetId,
                    [{
                        "type": "INFO",
                        "step": "CREATE-KEYCLOAK-WS-GROUPS",
                        "params": {
                            groupBase: `${acc.name}-${org.name}-${ws.name}`
                        },
                        "ts": new Date().toISOString()
                    }]
                );
            } catch (error) {
                console.error(error);
            }
            
            // Clean up NGinx loadbalancer resource configs
            await TaskNginxController.cleanupLoadbalancerAfterResourceDelete(task.payload[0].params.k8sNodes[0].workspaceId);

            // Delete Workspace DB entry
            await DBController.deleteWorkspace(task.payload[0].params.k8sNodes[0].workspaceId);
            
            await DBController.updateTaskStatus(task, "DONE", {
                "type": "INFO",
                "step": "DEPROVISION-WORKSPACE",
                "component": "task-controller",
                "ts": new Date().toISOString()
            });
        } catch (error) {
            await DBController.updateTaskStatus(task, "ERROR", {
                "type": "ERROR",
                "step": "DEPROVISION-WORKSPACE",
                "component": "task-controller",
                "message": error.message ? error.message : "Could not deprovision k8s cluster",
                "ts": new Date().toISOString()
            });
        }

        // Return leased IPs
        collectIps.forEach(ip => DHCPController.returnLeasedIp(ip));
    }

    /**
     * schedule
     * @param {*} taskType 
     * @param {*} target 
     * @param {*} targetId 
     * @param {*} payload 
     */
    static async schedule(taskType, target, targetId, payload) {
        let taskId = shortid.generate();
        let dbEntry = await DBController.createTask(taskId, taskType, target, targetId, "PENDING", JSON.stringify(payload ? payload : []));
        this.mqttController.client.publish(`/multipaas/task/new/${dbEntry.id}`);
    }
}

TaskController.pendingResponses = {};
TaskController.bussyTaskIds = [];
module.exports = TaskController;