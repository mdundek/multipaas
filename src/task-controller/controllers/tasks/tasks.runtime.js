const DBController = require('../db/index');
const TaskGlusterController = require('./tasks.gluster');
const TaskVolumeController = require('./tasks.volume');
const TaskNginxController = require('./tasks.nginx');
const Keycloak = require('../keycloak/index');

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class TaskRuntimeController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;        
    }

    /**
     * processScheduledInitiateK8sCluster
     * @param {*} task 
     */
    static async processScheduledInitiateK8sCluster(task) {
        task.payload = JSON.parse(task.payload);

        this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting MultiPaaS host resources");

        let memArray = await this.parent.collectMemoryFromNetwork();
        if(memArray.length > 0){
            let allDbHosts = await DBController.getAllK8sHosts();
            await this.registerMissingK8SHosts(allDbHosts, memArray);
        } else {
            this.mqttController.logEvent(task.payload[0].socketId, "error", "MultiPaaS is out of memory, can not create a new cluster");
            this.mqttController.closeEventStream(task.payload[0].socketId);
            return this.mqttController.client.publish('/multipaas/alert/out_of_resources/no_k8s_host');
        }
       
        let usableMemTargets = memArray.filter(h => h.memory > 3000);

        if(usableMemTargets.length == 0){
            this.mqttController.logEvent(task.payload[0].socketId, "error", "MultiPaaS is out of resources");
            this.mqttController.closeEventStream(task.payload[0].socketId);
            return this.mqttController.client.publish('/multipaas/alert/out_of_resources/k8s_host_memory');
        }

        try {
            // All good, create workspace cluster
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type": "INFO",
                "step": "PROVISIONING_K8S_CLUSTER",
                "component": "task-controller",
                "ts": new Date().toISOString()
            });

            let response = await this.mqttController.queryRequestResponse(usableMemTargets[0].ip, "deploy_k8s_cluster", {
                "taskId": task.id,
                "socketId": task.payload[0].socketId
            }, 60 * 1000 * 15);

            if(response.data.status != 200){
                // await DBController.removeWorkspace();
                const error = new Error(response.data.message);
                error.code = response.data.status;
                throw error;
            }

            try{
                let org = await DBController.getOrgForWorkspace(task.targetId);
                let ws = await DBController.getWorkspace(task.targetId);
                let acc = await DBController.getAccountForOrg(org.id);

                await this.parent.schedule(
                    "CREATE-KEYCLOAK-WS-GROUPS",
                    "workspace",
                    task.targetId,
                    [{
                        "type": "INFO",
                        "step": "CREATE-KEYCLOAK-WS-GROUPS",
                        "params": {
                            groupBase: `${acc.name}-${org.name}-${ws.name}`,
                            groups: [
                                'cluster-admin',
                                'admin',
                                'developer'
                            ],
                            clusterAdminUserEmail: task.payload[0].clusterAdminUserEmail
                        },
                        "ts": new Date().toISOString()
                    }]
                );
            } catch (error) {
                console.log(error);
            }

            await DBController.updateTaskStatus(task, "DONE", {
                "type": "INFO",
                "step": "PROVISIONING_K8S_CLUSTER",
                "component": "task-controller",
                "ts": new Date().toISOString()
            });
        } catch (error) {
            await DBController.deleteWorkspace(task.targetId);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type": "ERROR",
                "step": "PROVISIONING_K8S_CLUSTER",
                "component": "task-controller",
                "message": error.message ? error.message : "Could not create k8s cluster",
                "ts": new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * processScheduledUpdateK8sCluster
     * @param {*} task 
     */
    static async processScheduledUpdateK8sCluster(task) {
        task.payload = JSON.parse(task.payload);
        let updateFlags = task.payload[0].flags;

        if(updateFlags.scale != undefined && updateFlags.scale != null){
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

            let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(task.targetId);
            let allK8SHosts = await DBController.getAllK8sHosts();

            let memArray = await this.parent.collectMemoryFromNetwork();
            await this.registerMissingK8SHosts(allK8SHosts, memArray);
           
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
                    await this.scaleDownK8SClusterNodes(task.payload[0].socketId, masterNodesProfiles, workerNodesProfiles, true);
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
                        await this.scaleUpK8SCluster(task.payload[0].socketId, task.targetId, (workerNodes.length == 0) ? 0 : workerNodes.length, usableMemTargets, workerNodesProfiles, masterNodesProfiles, updateFlags, allK8SHosts);
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
                    this.mqttController.client.publish('/multipaas/alert/out_of_resources/k8s_host_memory');
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
                    await this.scaleDownK8SClusterNodes(task.payload[0].socketId, masterNodesProfiles, deproWorkers);

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
     * processScheduledBindProxyDomain
     * @param {*} task 
     */
    static async processScheduledBindProxyDomain(task) {
        task.payload = JSON.parse(task.payload);
        let client = null;
        let targetRoutes = null;
        try {
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Updating proxy config");
            await DBController.updateTaskStatus(task,"IN_PROGRESS", {
                "type":"INFO",
                "step":"BIND-DOMAIN",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });
            client = await DBController.startTransaction();
            
            // Update routes with subdomains and domain ID
            
            if(task.payload[0].flags.target == "app") {
                targetRoutes = await DBController.getApplicationRoutes(task.payload[0].flags.targetId);
            } else {
                targetRoutes = await DBController.getServiceRoutes(task.payload[0].flags.targetId);
            }

            for(let i=0; i<task.payload[0].flags.portDomainMappings.length; i++) {
                let mappingConfig = task.payload[0].flags.portDomainMappings[i];
                let targetRoute = targetRoutes.find(o => o.port == mappingConfig.internalPort);
                await DBController.updateRouteDomainData(
                    targetRoute.id, 
                    task.payload[0].flags.domainId, 
                    mappingConfig.subdomain, 
                    client
                );
            }
            await DBController.commitTransaction(client);
            client = null;
        } catch (error) {
            this.mqttController.logEvent(task.payload[0].socketId, "error", "An error occured, rolling back");
            console.log("ERROR =>", error);
            if(client) {
                await DBController.rollbackTransaction(client);
            }
            await DBController.updateTaskStatus(task,"ERROR", {
                "type":"ERROR",
                "step":"BIND-DOMAIN",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
            return this.mqttController.closeEventStream(task.payload[0].socketId);
        }

        try {
            let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(task.targetId);
            let allK8SHosts = await DBController.getAllK8sHosts();
            let masterNode = workspaceK8SNodes.find(n => n.nodeType == "MASTER");
            let masterHost = allK8SHosts.find(h => h.id == masterNode.k8sHostId);

            if(task.payload[0].flags.target == "app") {
                await TaskNginxController.updateWorkspaceIngress(
                    task.payload[0].flags.ns, 
                    masterHost, 
                    masterNode, 
                    {
                        services: false,
                        serviceId: null,
                        apps: true,
                        appId:  task.payload[0].flags.targetId,
                        tcp: targetRoutes.find(route => route.tcpStream) ? true : false
                    }
                );
            } else {
                await TaskNginxController.updateWorkspaceIngress(
                    task.payload[0].flags.ns, 
                    masterHost, 
                    masterNode, 
                    {
                        services: true,
                        serviceId: task.payload[0].flags.targetId,
                        apps: false,
                        appId: null,
                        tcp: targetRoutes.find(route => route.tcpStream) ? true : false
                    }
                );
            }

            // Now regenerate proxy config wor this workspace
            await TaskNginxController.updateAndApplyLoadbalancerConfig(
                task.targetId, 
                task.payload[0].flags.ns,
                workspaceK8SNodes
            );
           
            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"BIND-DOMAIN",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            this.mqttController.logEvent(task.payload[0].socketId, "error", "An error occured, rolling back");
            console.log("ERROR =>", error);
            
            for(let i=0; i<task.payload[0].flags.portDomainMappings.length; i++) {
                let mappingConfig = task.payload[0].flags.portDomainMappings[i];
                let targetRoute = targetRoutes.find(o => o.port == mappingConfig.internalPort);
                await DBController.updateRouteDomainData(
                    targetRoute.id, 
                    null, 
                    null
                );
            }

            await DBController.updateTaskStatus(task,"ERROR", {
                "type":"ERROR",
                "step":"BIND-DOMAIN",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            return this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * processScheduledUnbindProxyDomain
     * @param {*} task 
     */
    static async processScheduledUnbindProxyDomain(task) {
        task.payload = JSON.parse(task.payload);
        try {
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Updating proxy config");
            await DBController.updateTaskStatus(task,"IN_PROGRESS", {
                "type":"INFO",
                "step":"UNBIND-DOMAIN",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });
           
            await DBController.updateRouteDomainData(
                task.payload[0].flags.routeId, 
                null,
                null
            );
        } catch (error) {
            this.mqttController.logEvent(task.payload[0].socketId, "error", "An error occured");
            console.log("ERROR =>", error);
            await DBController.updateTaskStatus(task,"ERROR", {
                "type":"ERROR",
                "step":"UNBIND-DOMAIN",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
            return this.mqttController.closeEventStream(task.payload[0].socketId);
        }

        try {
            let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(task.targetId);
            let allK8SHosts = await DBController.getAllK8sHosts();
            let masterNode = workspaceK8SNodes.find(n => n.nodeType == "MASTER");
            let masterHost = allK8SHosts.find(h => h.id == masterNode.k8sHostId);

            if(task.payload[0].flags.target == "app") {
                await TaskNginxController.updateWorkspaceIngress(
                    task.payload[0].flags.ns, 
                    masterHost, 
                    masterNode, 
                    {
                        services: false,
                        serviceId: null,
                        apps: true,
                        appId:  task.payload[0].flags.targetId,
                        tcp: task.payload[0].flags.tcp
                    }
                );
            } else {
                await TaskNginxController.updateWorkspaceIngress(
                    task.payload[0].flags.ns, 
                    masterHost, 
                    masterNode, 
                    {
                        services: true,
                        serviceId: task.payload[0].flags.targetId,
                        apps: false,
                        appId: null,
                        tcp: task.payload[0].flags.tcp
                    }
                );
            }

            // Now regenerate proxy config wor this workspace
            await TaskNginxController.updateAndApplyLoadbalancerConfig(
                task.targetId, 
                task.payload[0].flags.ns,
                workspaceK8SNodes
            );
           
            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"UNBIND-DOMAIN",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            this.mqttController.logEvent(task.payload[0].socketId, "error", "An error occured, rolling back");
            console.log("ERROR =>", error);
            
            await DBController.updateRouteDomainData(
                task.payload[0].flags.routeId,
                task.payload[0].flags.domainId, 
                task.payload[0].flags.subdomain
            );
           
            await DBController.updateTaskStatus(task,"ERROR", {
                "type":"ERROR",
                "step":"UNBIND-DOMAIN",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            return this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * registerMissingK8SHosts
     * @param {*} allDbHosts 
     * @param {*} memArray 
     */
    static async registerMissingK8SHosts(allDbHosts, memArray) {
        // Make sure all hosts are registered
        for(let i=0; i<memArray.length; i++){                           
            if(!allDbHosts.find(dbh => dbh.ip == memArray[i].ip)){
                await DBController.createK8sHost(
                    memArray[i].ip,
                    memArray[i].hostname,
                    "READY"
                );
            }
        }
    }

    /**
     * updateClusterPodPresets
     * @param {*} workspaceId 
     * @param {*} ns 
     * @param {*} masterHost 
     * @param {*} masterNode 
     */
    static async updateClusterPodPresets(workspaceId, ns, masterHost, masterNode) {
        // Update pod presets on cluster
        let serviceAndRoutes = await DBController.getServicesForWsRoutes(workspaceId, ns);
        let podPresetResponse = await this.mqttController.queryRequestResponse(masterHost.ip, "update_cluster_pod_presets", {
            "host": masterHost, 
            "node": masterNode,
            "ns": ns,
            "allServices": serviceAndRoutes
        }, 60 * 1000 * 1);
        if(podPresetResponse.data.status != 200){
            const error = new Error(podPresetResponse.data.message);
            error.code = podPresetResponse.data.status;
            throw error;
        }
    }

    /**
     * provisionK8SWorker
     * @param {*} masterNode 
     * @param {*} masterHost 
     * @param {*} workerHost 
     */
    static async provisionK8SWorker(masterNode, masterHost, workerHost) {
        let response = await this.mqttController.queryRequestResponse(workerHost.ip, "provision_worker", {
            "masterNode": masterNode,
            "masterHost": masterHost
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
        return response.data;
    }

    /**
     * deprovisionK8SWorker
     * @param {*} node 
     * @param {*} host 
     */
    static async deprovisionK8SWorker(masterNode, masterHost, workerNode, workerHost) {
        let response = await this.mqttController.queryRequestResponse(workerHost.ip, "deprovision_worker", {
            "masterNode": masterNode,
            "masterHost": masterHost,
            "workerNode": workerNode,
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
        return response;
    }

    /**
     * deprovisionK8SMaster
     * @param {*} masterNode 
     * @param {*} masterHost 
     */
    static async deprovisionK8SMaster(masterNode, masterHost) {
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "deprovision_master", {
            "node": masterNode,
            "host": masterHost
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }

    /**
     * detatchK8SWorker
     * @param {*} node 
     * @param {*} host 
     */
    static async detatchK8SWorker(masterNode, masterHost, workerNode, workerHost) {
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "detatch_worker", {
            "masterNode": masterNode,
            "workerNode": workerNode
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
        return response;
    }

    

    /**
     * taintK8SMaster
     * @param {*} node 
     * @param {*} host 
     */
    static async taintK8SMaster(masterNode, masterHost) {
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "taint_master", {
            "masterNode": masterNode
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }

    /**
     * untaintK8SMaster
     * @param {*} node 
     * @param {*} host 
     */
    static async untaintK8SMaster(masterNode, masterHost) {
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "untaint_master", {
            "masterNode": masterNode
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }

    /**
     * scaleDownK8SClusterNodes
     * @param {*} masterNodesProfiles 
     * @param {*} workerNodesProfiles 
     */
    static async scaleDownK8SClusterNodes(socketId, masterNodesProfiles, workerNodesProfiles, untaintMaster) {
        // Get workspace volumes and bindings
        let volumeBindings = await DBController.getVolumeBindingsForWorkspace(masterNodesProfiles[0].node.workspaceId);
        let volumes = await DBController.getVolumesForK8SCluster(masterNodesProfiles[0].node.workspaceId);

        // Need to deprovision workerNodes
        for(let i=0; i<workerNodesProfiles.length; i++){
            this.mqttController.logEvent(socketId, "info", "Detatching cluster node " + workerNodesProfiles[i].node.ip);
            await this.detatchK8SWorker(masterNodesProfiles[0].node, masterNodesProfiles[0].host, workerNodesProfiles[i].node, workerNodesProfiles[i].host);
            // Clean up
            for(let y=0; y<volumeBindings.length; y++){
                let tVolume = volumes.find(v => v.id == volumeBindings[y].volumeId);
                if(tVolume.type == "local"){
                    try{
                        this.mqttController.logEvent(socketId, "info", `Deprovisioning volume ${y+1}/${volumeBindings.length} for node ${workerNodesProfiles[i].node.ip}`);
                        await TaskVolumeController.detatchLocalVolumeFromVM(workerNodesProfiles[i].node.workspaceId, workerNodesProfiles[i], volumeBindings[y].volumeId, true);
                        await TaskVolumeController.deleteLocalVolumeFromNode(workerNodesProfiles[i].host, workerNodesProfiles[i].node, volumeBindings[y].volumeId)
                    } catch(_e){console.log(_e);}
                }
            }
            // Now remove worker VM
            this.mqttController.logEvent(socketId, "info", "Deprovisioning cluster node " + workerNodesProfiles[i].node.ip);
            await this.deprovisionK8SWorker(masterNodesProfiles[0].node, masterNodesProfiles[0].host, workerNodesProfiles[i].node, workerNodesProfiles[i].host);
        }
        if(untaintMaster){
            // untaint master node again to take on the workload
            this.mqttController.logEvent(socketId, "info", "Untaing master node");
            await this.untaintK8SMaster(masterNodesProfiles[0].node, masterNodesProfiles[0].host);
        }
        this.mqttController.logEvent(socketId, "info", "Updating Nginx proxy upstream servers");
        await TaskNginxController.requestUpdateUpstreamServersForCluster(masterNodesProfiles[0].node.workspaceId);
    }

    /**
     * scaleUpK8SCluster
     * @param {*} workspaceId 
     * @param {*} provisionCount 
     * @param {*} usableMemTargets 
     * @param {*} workerNodesProfiles 
     * @param {*} masterNodesProfiles 
     * @param {*} updateFlags 
     * @param {*} allK8SHosts 
     */
    static async scaleUpK8SCluster(socketId, workspaceId, provisionCount, usableMemTargets, workerNodesProfiles, masterNodesProfiles, updateFlags, allK8SHosts) {
        // Rollback helper function
        let _rollbackVolumesAndMounts = async (_successAttach, _volumes, _newNodeProfile, _successMounts) => {
            // Rollback attached volumes
            for(let y=0; y<_successAttach.length; y++){
                let targetV = _volumes.find(v => v.id == _successAttach[y].volumeId);

                if(targetV.type == "gluster"){
                    try{await TaskGlusterController.unmountGlusterVolumeFromClusterVMs(socketId, workspaceId, targetV, [_newNodeProfile.node.id]);} catch(_e){}
                } else if(targetV.type == "local"){
                    // Rollback mounts for this volume
                    let tmpSuccessMounts = _successMounts.filter(o => o.volumeBindingId == _successAttach[y].id);
                    for(let i=0; i<tmpSuccessMounts.length; i++){
                        await this.mqttController.queryRequestResponse(_newNodeProfile.host.ip, "unmount_local_volume", {
                            "nodeProfile": _newNodeProfile,
                            "volumeMountName": tmpSuccessMounts[i].mountFolderName
                        }, 60 * 1000 * 15);
                    }
                    // Now rollback volume attachement
                    try{await TaskVolumeController.detatchLocalVolumeFromVM(workspaceId, _newNodeProfile, targetV.id);} catch(_e){}
                }
            }
        }

        let successfullJobResponses = [];
        try{
            let availNodeIndex = 0;

            // recuperate the hosts in use and not in use by this cluster
            let unusedMemHosts = usableMemTargets.filter(o => (!workerNodesProfiles.find(m => m.host.ip == o.ip) && !masterNodesProfiles.find(m => m.host.ip == o.ip)));
            let usedMemHosts = usableMemTargets.filter(o => (workerNodesProfiles.find(m => m.host.ip == o.ip) || masterNodesProfiles.find(m => m.host.ip == o.ip)));
            
            // Get workspace volumes and bindings
            let volumes = await DBController.getVolumesForK8SCluster(workspaceId);
            let volumeBindings = await DBController.getVolumeBindingsForWorkspace(workspaceId);
            
            // Get Services and apps
            // let wsServices = await DBController.getServicesForWsRoutes(workspaceId);
            // let wsApplications = await DBController.getApplicationsForWsRoutes(workspaceId);
          
            // Provision workers
            // TODO: This is ok for most cases, but not robust enougth to ensure every target host can really take the load. 
            // Also, there is no mechanism yet that will count how many instances on each host to make decisions here.
            let deltaProvisioning = updateFlags.scale - provisionCount;
            let counter = 0;
            for(let i=provisionCount; i<updateFlags.scale; i++){
                counter++;

                let targetMemHost = null;
                // First, favor the once not in use
                if(unusedMemHosts.length > 0){
                    targetMemHost = unusedMemHosts.shift();
                } 
                // Once those are gone, switch to the once already in use
                else if (usedMemHosts.length > 0) {
                    targetMemHost = usedMemHosts.shift();
                } 
                // Once those are gone, just go over the whole list and pick one after the next.
                else {
                    // Make sure we iterate over the available hosts
                    if(usableMemTargets.length <= availNodeIndex){
                        availNodeIndex = 0;
                    }
                    targetMemHost = usableMemTargets[availNodeIndex];
                    availNodeIndex++;
                }
                this.mqttController.logEvent(socketId, "info", `Deploying worker node ${counter}/${deltaProvisioning}`);
                let jobResponse = await this.provisionK8SWorker(masterNodesProfiles[0].node, masterNodesProfiles[0].host, allK8SHosts.find(o => o.ip == targetMemHost.ip));
                successfullJobResponses.push(jobResponse);
                let newNode = await DBController.getK8sNode(jobResponse.k8sNodeId);
                let newNodeProfile = {
                    "host": allK8SHosts.find(o => o.ip == targetMemHost.ip),
                    "node": newNode
                };

                // Attach bound volumes for those new workers if any && 
                // mount service and app folders if any
                let successAttach = [];
                let successMounts = [];
                try {
                    let boundVolumes = volumes.filter(v => volumeBindings.find(vb => vb.volumeId == v.id) );
                    for(let y=0; y<boundVolumes.length; y++){
                        let targetV = boundVolumes[y];
                        if(targetV.type == "gluster"){
                            this.mqttController.logEvent(socketId, "info", `Mounting Gluster volume ${y+1}/${boundVolumes.length} on new node ${counter}/${deltaProvisioning}`);
                            await TaskGlusterController.mountGlusterVolumeToClusterVMs(socketId, workspaceId, targetV, [newNode.id]);
                            let vbObj = volumeBindings.find(vb => vb.volumeId == boundVolumes[y].id);
                            successAttach.push(vbObj);

                            // NOTE: Probably not necessary, mounting the volume will sync existing folders from the gluster network
                          
                        } else if(targetV.type == "local"){
                            this.mqttController.logEvent(socketId, "info", `Attaching local volume ${y+1}/${boundVolumes.length} to new node ${counter}/${deltaProvisioning}`);
                            await TaskVolumeController.attachLocalVolumeToVM(workspaceId, newNodeProfile, targetV);

                            let vbObj = volumeBindings.find(vb => vb.volumeId == boundVolumes[y].id);
                            successAttach.push(vbObj);

                            // Now mount base volume folder to new VM
                            this.mqttController.logEvent(socketId, "info", `Mounting local volume ${y+1}/${boundVolumes.length} to new node ${counter}/${deltaProvisioning}`);

                            let mountFolderName = `${targetV.name}-${targetV.secret}`;
                            let responseMount = await this.mqttController.queryRequestResponse(newNodeProfile.host.ip, "mount_local_volume", {
                                "node": newNode,
                                "volume": targetV,
                                "mountFolderName": mountFolderName
                            }, 60 * 1000 * 3);
                            if(responseMount.data.status != 200){
                                const error = new Error(responseMount.data.message);
                                error.code = responseMount.data.status;
                                throw error;
                            }
                            successMounts.push({
                                "volumeBindingId": vbObj.id,
                                "mountFolderName": mountFolderName
                            });

                            // Now create all PV local volumes from all namespaces on this node
                            let allPvsResponse = await this.mqttController.queryRequestResponse(masterNodesProfiles[0].host.ip, "get_k8s_resources", {
                                "targets": ["pv"],
                                "ns": "*",
                                "node": masterNodesProfiles[0].node,
                                "json": true
                            }, 15000);
                            if(allPvsResponse.data.status != 200){
                                const error = new Error(allPvsResponse.data.message);
                                error.code = allPvsResponse.data.status;
                                throw error;
                            }

                            for(let z=0; z<allPvsResponse.data.output.pv.items.length; z++) {
                                let pvDescription = allPvsResponse.data.output.pv.items[z];
                                if(pvDescription.spec.storageClassName == "local-storage") {
                                    await this.mqttController.queryRequestResponse(newNodeProfile.host.ip, "create_pv_directory", {
                                        "node": newNodeProfile.node,
                                        "volume": targetV,
                                        "subFolderName": pvDescription.spec.local.path.split('/').pop()
                                    }, 60 * 1000 * 3);
                                }
                            }

                            // Mount service and app folders if any
                            // for(let i=0; i<wsServices.length; i++){
                            //     this.mqttController.logEvent(socketId, "info", `Creating PV for local volume ${y+1}/${boundVolumes.length} on new node ${counter}/${deltaProvisioning} for service ${wsServices[i].name}`);
                            //     await this.mqttController.queryRequestResponse(newNodeProfile.host.ip, "create_pv_directory", {
                            //         "node": newNode,
                            //         "volume": targetV,
                            //         "subFolderName": `ns-${wsServices[i].namespace}-srv-${wsServices[i].name}-pv`
                            //     }, 60 * 1000 * 3);
                            // }
                        }
                    }
                    // Store job details in case we need to rollback later
                    successfullJobResponses.push({
                        "task": "volumesAndServices",
                        "successAttach": successAttach, 
                        "volumes": volumes,
                        "newNodeProfile": newNodeProfile,
                        "successMounts": successMounts
                    });

                    // this.mqttController.logEvent(socketId, "info", `Deployed worker node ${counter}/${deltaProvisioning} successfully`);
                } catch (error) {
                    this.mqttController.logEvent(socketId, "error", `Error while deploying node ${counter}/${deltaProvisioning}, rollback`);
                    // TODO: Getting error saying that VBox device not mounted. To investigate...
                    await _rollbackVolumesAndMounts(successAttach, volumes, newNodeProfile, successMounts);
                    throw error;
                }
            }
            this.mqttController.logEvent(socketId, "info", `Tainting master node`);
            // taint master(s) node to not take on workload anymore
            await this.taintK8SMaster(masterNodesProfiles[0].node, masterNodesProfiles[0].host);

            this.mqttController.logEvent(socketId, "info", "Updating Nginx proxy upstream servers");
            await TaskNginxController.requestUpdateUpstreamServersForCluster(workspaceId);
        } catch(err) {
            console.log("scaleUpK8SCluster error =>", err);
            let workspaceNodes = await DBController.getK8sWorkspaceNodes(workspaceId);
            // Clean up resources that were created successfully before the exception
            for(let i=0; i<successfullJobResponses.length; i++){
                let jobItem = successfullJobResponses[i];
                if(jobItem.task == "provision" && jobItem.nodeType == "worker"){
                    try {
                        let workerNode = workspaceNodes.find(o => o.id == jobItem.k8sNodeId);
                        let workerHost = allK8SHosts.find(o => o.id == workerNode.k8sHostId);
                        
                        let masterNode = workspaceNodes.find(o => o.nodeType == "MASTER");
                        let masterHost = allK8SHosts.find(o => o.id == masterNode.k8sHostId);

                        await this.scaleDownK8SClusterNodes(socketId, [{
                            "node": masterNode,
                            "host": masterHost
                        }], [{
                            "node": workerNode,
                            "host": workerHost
                        }], false)
                    } catch (error) {
                        console.log("rollback error =>", error);
                    }
                } 
                else if(jobItem.task == "provision" && jobItem.nodeType == "master"){
                    // TODO: Need to implement when we support multi master for clusters
                } 
                else if(jobItem.task == "volumesAndServices") {
                    await _rollbackVolumesAndMounts(jobItem.successAttach, jobItem.volumes, jobItem.newNodeProfile, jobItem.successMounts);
                }
            }

            // If there are no more worker nodes, the we make sure our masters are untainted
            let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
            if(workspaceK8SNodes.filter(n => n.nodeType == "WORKER").length == 0) {
                let masterNodes = workspaceK8SNodes.filter(n => n.nodeType == "MASTER");
                for(let i=0; i<masterNodes.length; i++){
                    let masterHost = allK8SHosts.find(h => h.id == masterNodes[i].k8sHostId);
                    try {
                        this.mqttController.logEvent(socketId, "info", `Untainting master node`);
                        await this.untaintK8SMaster(masterNodes[i], masterHost)
                    } catch (error) {
                        console.log("untaintK8SMaster error =>", error);
                    }
                }
            }
            throw err;
        }
    }

     /**
     * deprovisionPVC
     * @param {*} nodeProfile 
     * @param {*} pvcName 
     */
    static async deprovisionPVC(nodeProfile, ns, pvcName) {
        await this.mqttController.queryRequestResponse(nodeProfile.host.ip, "deprovision_pvc", {
            "pvcName": pvcName,
            "ns": ns,
            "node": nodeProfile.node
        }, 60 * 1000 * 5);
    }

    /**
     * deprovisionPV
     * @param {*} nodeProfile 
     * @param {*} pvName 
     * @param {*} subfolderName 
     * @param {*} volume 
     */
    static async deprovisionPV(nodeProfile, ns, pvName, subfolderName, volume) {
        await this.mqttController.queryRequestResponse(nodeProfile.host.ip, "deprovision_pv", {
            "pvName": pvName,
            "ns": ns,
            "volume": volume,
            "subFolderName": subfolderName,
            "node": nodeProfile.node
        }, 60 * 1000 * 5);
    }
}
TaskRuntimeController.pendingResponses = {};
TaskRuntimeController.bussyTaskIds = [];
module.exports = TaskRuntimeController;