const DBController = require('../db/index');
const OSController = require('../os/index');
const TaskVolumeController = require('./tasks.volume');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

class TaskRuntimeController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
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
     * initiateK8sCluster
     * @param {*} task 
     */
    static async initiateK8sCluster(task) {
        task.payload = JSON.parse(task.payload);

        this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting MyCloud host resources");

        let memArray = await this.parent.collectMemoryFromNetwork();
        if(memArray.length > 0){
            let allDbHosts = await DBController.getAllK8sHosts();
            await this.registerMissingK8SHosts(allDbHosts, memArray);
        } else {
            this.mqttController.logEvent(task.payload[0].socketId, "error", "MyCloud is out of memory to allocate a new cluster");
            this.mqttController.closeEventStream(task.payload[0].socketId);
            return this.mqttController.client.publish('/mycloud/alert/out_of_resources/no_k8s_host');
        }
       
        let usableMemTargets = memArray.filter(h => h.memory > 3000);

        if(usableMemTargets.length == 0){
            this.mqttController.logEvent(task.payload[0].socketId, "error", "MyCloud is out of resources");
            this.mqttController.closeEventStream(task.payload[0].socketId);
            return this.mqttController.client.publish('/mycloud/alert/out_of_resources/k8s_host_memory');
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
     * deprovisionK8SMaster
     * @param {*} masterNode 
     * @param {*} masterHost 
     */
    static async deprovisionK8SMaster(masterNode, masterHost) {
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "deprovision_master", {
            "masterNode": masterNode
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
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
    }

    /**
     * removeServiceResourcesFromCluster
     * @param {*} workerNodesProfiles 
     */
    static async removeServiceResourcesFromCluster(service) {        
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(service.workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let nodeProfiles = workspaceK8SNodes.map(n => {
            return {
                "node": n, 
                "host": allK8SHosts.find(h => h.id == n.k8sHostId)
            }
        });

        // // Clean up
        // if(service.dedicatedPvc && service.dedicatedPvc.length > 0){
        //     await TaskVolumeController.deprovisionPVC(nodeProfiles[0].find(o => o.node.nodeType == "MASTER"), service.dedicatedPvc);
        // }
        // if(service.dedicatedPv && service.dedicatedPv.length > 0){
        //     await TaskVolumeController.deprovisionPV(nodeProfiles[0].find(o => o.node.nodeType == "MASTER"), service.dedicatedPv);
        // }

        // Need to deprovision workerNodes
        for(let i=0; i<nodeProfiles.length; i++){
            if(service.hasDedicatedVolume != null) {
                await TaskVolumeController.deleteLocalVolumeFromNode(nodeProfiles[i].host, nodeProfiles[i].node, service.volumeId);
            }
        }
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
                    try{await this.unmountGlusterVolumeFromClusterVMs(socketId, workspaceId, targetV, [_newNodeProfile.node.id]);} catch(_e){}
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

        let workspaceNodes = await DBController.getK8sWorkspaceNodes(workspaceId);
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
            let wsServices = await DBController.getServicesForWsRoutes(workspaceId);
            let wsApplications = await DBController.getApplicationsForWsRoutes(workspaceId);
            let allServices = wsServices.concat(wsApplications);

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
                    boundVolumes.sort((a, b) => (a.portIndex > b.portIndex) ? 1 : -1); // Make sure we are sorting by port index

                    for(let y=0; y<boundVolumes.length; y++){
                        let targetV = boundVolumes[y];
                        if(targetV.type == "gluster"){
                            this.mqttController.logEvent(socketId, "info", `Mounting Gluster volume ${y+1}/${boundVolumes.length} on new node ${counter}/${deltaProvisioning}`);
                            await this.mountGlusterVolumeToClusterVMs(socketId, workspaceId, targetV, [newNode.id]);
                            let vbObj = volumeBindings.find(vb => vb.volumeId == boundVolumes[y].id);
                            successAttach.push(vbObj);

                            // NOTE: Probably not necessary, mounting the volume will sync existing folders from the gluster network
                            // // Mount service and app folders if any
                            // for(let i=0; i<allServices.length; i++){
                            //     await this.mqttController.queryRequestResponse(newNodeProfile.host.ip, "create_pv_directory", {
                            //         "node": newNode,
                            //         "volume": targetV,
                            //         "subFolderName": `srv-${allServices[i].name}`
                            //     }, 60 * 1000 * 3);
                            // }
                        } else if(targetV.type == "local"){
                            this.mqttController.logEvent(socketId, "info", `Attaching local volume ${y+1}/${boundVolumes.length} to new node ${counter}/${deltaProvisioning}`);
                            await TaskVolumeController.attachLocalVolumeToVM(workspaceId, newNodeProfile, targetV);

                            let vbObj = volumeBindings.find(vb => vb.volumeId == boundVolumes[y].id);
                            successAttach.push(vbObj);

                            // Mount service and app folders if any
                            for(let i=0; i<allServices.length; i++){
                                this.mqttController.logEvent(socketId, "info", `Mounting local volume ${y+1}/${boundVolumes.length} to new node ${counter}/${deltaProvisioning} for service ${allServices[i].name}`);

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
                                this.mqttController.logEvent(socketId, "info", `Creating PV for local volume ${y+1}/${boundVolumes.length} on new node ${counter}/${deltaProvisioning} for service ${allServices[i].name}`);
                                await this.mqttController.queryRequestResponse(newNodeProfile.host.ip, "create_pv_directory", {
                                    "node": newNode,
                                    "volume": targetV,
                                    "subFolderName": `srv-${allServices[i].name}`
                                }, 60 * 1000 * 3);
                            }
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

                    this.mqttController.logEvent(socketId, "info", `Deployed worker node ${counter}/${deltaProvisioning} successfully`);
                } catch (error) {
                    this.mqttController.logEvent(socketId, "error", `Error while deploying node ${counter}/${deltaProvisioning}, rollback`);
                    await _rollbackVolumesAndMounts(successAttach, volumes, newNodeProfile, successMounts);
                    throw error;
                }
            }
            this.mqttController.logEvent(socketId, "info", `Tainting master node`);
            // taint master(s) node to not take on workload anymore
            await this.taintK8SMaster(masterNodesProfiles[0].node, masterNodesProfiles[0].host);
        } catch(err) {
            console.log("scaleUpK8SCluster error =>", err);
            workspaceNodes = await DBController.getK8sWorkspaceNodes(workspaceId);
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

                        // await this.detatchK8SWorker(masterNode, masterHost, workerNode, workerHost);
                        // await this.deprovisionK8SWorker(masterNode, masterHost, workerNode, workerHost);
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
     * mountGlusterVolumeToClusterVMs
     * @param {*} workspaceId 
     * @param {*} volume 
     * @param {*} target 
     * @param {*} upgradeNodeIds 
     */
    static async mountGlusterVolumeToClusterVMs(socketId, workspaceId, volume, upgradeNodeIds) {
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let nodeProfiles = workspaceK8SNodes.map(n => {
            return {
                "node": n, 
                "host": allK8SHosts.find(h => h.id == n.k8sHostId)
            }
        });

        // Get all volume consumer IPs
        let volumeBindingIps = workspaceK8SNodes.map(o =>o.ip);
        let volBindings = await DBController.getGlusteVolumeBindingsByVolumeId(volume.id);
        for(let i=0; i<volBindings.length; i++) {
            if(volBindings[i].target == "workspace"){
                let otherWorkspaceNodes = await DBController.getAllK8sWorkspaceNodes(volBindings[i].targetId);
                volumeBindingIps = volumeBindingIps.concat(otherWorkspaceNodes.map(o => o.ip));
            } else {
                // TODO: If volume is also used by other type of resources, such as VMs
                throw new Error("Unsupported binding target " + volBindings[i].target);
            }
        }

        // Allow all node IPs on Gluster volume
        let volumeName = volume.name + "-" + volume.secret;
        let glusterVolumeHosts = await DBController.getGlusterHostsByVolumeId(volume.id);
        
        // Update volume authorized IPs

        this.mqttController.logEvent(socketId, "info", "Setting authorized IPs for this Gluster volume");

        let response = await this.mqttController.queryRequestResponse(glusterVolumeHosts[0].ip, "set_gluster_authorized_ips", {
            "ips": volumeBindingIps,
            "volumeName": volumeName
        }, 60 * 1000 * 3);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    
        // Mount volume on all cluster nodes
        let successMounts = [];
        try {
            for(let i=0; i<nodeProfiles.length; i++) {
                if(!upgradeNodeIds || upgradeNodeIds.indexOf(nodeProfiles[i].node.id) != -1){
                    this.mqttController.logEvent(socketId, "info", `Mounting Gluster volume for node ${i+1}/${nodeProfiles.length}`);
                    await this.mountK8SNodeGlusterVolume(nodeProfiles[i], volume);
                    successMounts.push(nodeProfiles[i]);
                }
            }
        } catch (error) {
            this.mqttController.logEvent(socketId, "error", `Could not mount gluster volumes, rollback`);
            for(let i=0; i<successMounts.length; i++) {
                try { await this.unmountK8SNodeGlusterVolume(successMounts[i], volume); } catch (_error) { console.log(_error); }
            }
            if(successMounts.length > 0){
                // Remove authorized IPs for gluster volume
                let toRemoveIps;
                if(upgradeNodeIds){
                    toRemoveIps = workspaceK8SNodes.filter(o => upgradeNodeIds.indexOf(o.id) != -1).map(o =>o.ip);
                } else {
                    toRemoveIps = workspaceK8SNodes.map(o =>o.ip);
                }
                volumeBindingIps = volumeBindingIps.filter(o => toRemoveIps.indexOf(o) == -1);
                await this.mqttController.queryRequestResponse(glusterVolumeHosts[0].ip, "set_gluster_authorized_ips", {
                    "ips": volumeBindingIps,
                    "volumeName": volumeName
                }, 60 * 1000 * 3);
            }
            throw error;
        }
    }

    /**
     * unmountGlusterVolumeFromClusterVMs
     * @param {*} workspaceId 
     * @param {*} volume 
     * @param {*} target 
     * @param {*} downgradeNodeIds 
     */
    static async unmountGlusterVolumeFromClusterVMs(socketId, workspaceId, volume, downgradeNodeIds) {
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let nodeProfiles = workspaceK8SNodes.map(n => {
            return {
                "node": n, 
                "host": allK8SHosts.find(h => h.id == n.k8sHostId)
            }
        });

        let volumeName = volume.name + "-" + volume.secret;
        
        // Remove persistant k8s volume for this gluster volume
        let masterNode;
        let masterHost;
        if(!downgradeNodeIds){ // Only applies if unbinding ALL nodes
            masterNode = workspaceK8SNodes.find(n => n.nodeType == "MASTER");
            masterHost = allK8SHosts.find(h => h.id == masterNode.k8sHostId);
            this.mqttController.logEvent(socketId, "info", `deleting all volume specific PVs`);
            let response = await this.mqttController.queryRequestResponse(masterHost.ip, "remove_k8s_all_pv_for_volume", {
                "node": masterNode,
                "host": masterHost,
                "volume": volume,
                "ns": "*",
                "hostnames": workspaceK8SNodes.map(o =>o.hostname)
            }, 60 * 1000 * 3);
            
            if(response.data.status != 200){
                const error = new Error(response.data.message);
                error.code = response.data.status;
                throw error;
            } 
        }
        
        // Unmount volumes
        let successUnmounts = [];
        try{
            for(let i=0; i<nodeProfiles.length; i++){
                if(!downgradeNodeIds || downgradeNodeIds.indexOf(nodeProfiles[i].node.id) != -1){
                    this.mqttController.logEvent(socketId, "info", `Unmount Gluster volume for node ${i+1}/${nodeProfiles.length}`);
                    await this.unmountK8SNodeGlusterVolume(nodeProfiles[i], volume);
                    successUnmounts.push(nodeProfiles[i]);
                }
            }
        } catch (error) {
            this.mqttController.logEvent(socketId, "info", `An error occured unmounting Gluster volume, rollback`);
            for(let i=0; i<successUnmounts.length; i++) {
                try { await this.mountK8SNodeGlusterVolume(successUnmounts[i], volume); } catch (_) {console.log(_e)}
            }
            throw error;
        }

        // Set authorized IPs for this volume
        try{
            this.mqttController.logEvent(socketId, "info", `Setting Gluster authorized IPs`);
            // Get all volume consumer IPs
            workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
            let allVolumeBindings = workspaceK8SNodes.map(o => o); // clone
            let volGlobalBindings = await DBController.getGlusteVolumeBindingsByVolumeId(volume.id);
            for(let i=0; i<volGlobalBindings.length; i++) {
                if(volGlobalBindings[i].target == "workspace"){
                    let otherWorkspaceNodes = await DBController.getAllK8sWorkspaceNodes(volGlobalBindings[i].targetId);
                    otherWorkspaceNodes.forEach(o => {
                        if(!allVolumeBindings.find(a => a.id == o.id)){
                            allVolumeBindings.push(o);
                        }
                    });
                } else {
                    // TODO: If volume is also used by other type of resources, such as VMs
                    throw new Error("Unsupported binding target " + volGlobalBindings[i].target);
                }
            }
            
            let allVolumeBindingIps = allVolumeBindings.map(o => o.ip);
            let remainingVolumeBindingIps;
            if(!downgradeNodeIds){ // Only applies if unbinding ALL nodes
                let volumeBindingIps = workspaceK8SNodes.map(o => o.ip);
                remainingVolumeBindingIps = allVolumeBindingIps.filter(o => volumeBindingIps.indexOf(o) == -1);
            } else {
                let downgradeNodes = downgradeNodeIds.map(o => workspaceK8SNodes.find(a => a.id == o) );
                let downgradeNodesIps = downgradeNodes.map(o => o.ip);
                remainingVolumeBindingIps = allVolumeBindingIps.filter(o => downgradeNodesIps.indexOf(o) == -1);
            }

            let glusterVolumeHosts = await DBController.getGlusterHostsByVolumeId(volume.id);
            let response = await this.mqttController.queryRequestResponse(glusterVolumeHosts[0].ip, "set_gluster_authorized_ips", {
                "ips": remainingVolumeBindingIps.length == 0 ? ["10.20.30.40"] : remainingVolumeBindingIps,
                "volumeName": volumeName
            }, 60 * 1000 * 3);
            if(response.data.status != 200){
                const error = new Error(response.data.message);
                error.code = response.data.status;
                throw error;
            } 
        } catch (error) {
            this.mqttController.logEvent(socketId, "info", `An error occured setting Gluster authorized IPs, rollback`);
            for(let i=0; i<successUnmounts.length; i++) {
                try { await this.mountK8SNodeGlusterVolume(successUnmounts[i], volume); } catch (_) {console.log(_e)}
            }
            throw error;
        }     
    }

    /**
     * mountK8SNodeGlusterVolume
     * @param {*} nodeProfile 
     * @param {*} volume 
     */
    static async mountK8SNodeGlusterVolume(nodeProfile, volume) {
        let response = await this.mqttController.queryRequestResponse(nodeProfile.host.ip, "mount_gluster_volume", {
            "nodeProfile": nodeProfile,
            "volume": volume
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
        return response;
    }

    /**
     * unmountK8SNodeGlusterVolume
     * @param {*} nodeProfile 
     * @param {*} volume 
     */
    static async unmountK8SNodeGlusterVolume(nodeProfile, volume) {
        let response = await this.mqttController.queryRequestResponse(nodeProfile.host.ip, "unmount_gluster_volume", {
            "nodeProfile": nodeProfile,
            "volume": volume
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
        return response;
    }

    

}
TaskRuntimeController.pendingResponses = {};
TaskRuntimeController.bussyTaskIds = [];
module.exports = TaskRuntimeController;