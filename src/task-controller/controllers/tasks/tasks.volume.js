const DBController = require('../db/index');
const TaskGlusterController = require('./tasks.gluster');

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class TaskVolumeController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
    }

    /**
     * processScheduledUnbindVolume
     * @param {*} task 
     */
    static async processScheduledUnbindVolume(task) {
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
                    snapshotData = await this.parent.takeClusterSnapshot(task.targetId);
                    await TaskGlusterController.unmountGlusterVolumeFromClusterVMs(task.payload[0].socketId, task.targetId, task.payload[0].params.volume);
                    await this.removeVolumeBindingFromDb(task.targetId, task.payload[0].params.volume.id, task.payload[0].params.unbindFrom == "k8s" ? "workspace" : "vm");
                    await this.parent.cleanUpClusterSnapshot(snapshotData);
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                } else if(task.payload[0].params.volume.type == "local") {
                    snapshotData = await this.parent.takeClusterSnapshot(task.targetId);
                    await this.detatchAndUnmountLocalVolumeFromClusterVMs(task.payload[0].socketId, task.targetId, task.payload[0].params.volume.id);
                    await this.removeVolumeBindingFromDb(task.targetId, task.payload[0].params.volume.id, task.payload[0].params.unbindFrom == "k8s" ? "workspace" : "vm");
                    await this.parent.cleanUpClusterSnapshot(snapshotData);
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
                    await this.parent.restoreClusterSnapshot(snapshotData);
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
     * processScheduledBindVolume
     * @param {*} task 
     */
    static async processScheduledBindVolume(task) {
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
                    // snapshotData = await this.parent.takeClusterSnapshot(task.targetId);
                    await TaskGlusterController.mountGlusterVolumeToClusterVMs(task.payload[0].socketId, task.targetId, task.payload[0].params.volume);
                    await this.addVolumeBindingToDb(task.targetId, task.payload[0].params.volume.id, task.payload[0].params.bindTo == "k8s" ? "workspace" : "vm");
                    // await this.parent.cleanUpClusterSnapshot(snapshotData);
                    this.mqttController.closeEventStream(task.payload[0].socketId);
                } else if(task.payload[0].params.volume.type == "local") {
                    snapshotData = await this.parent.takeClusterSnapshot(task.targetId);
                    await this.attachAndMountLocalVolumeToClusterVMs(task.payload[0].socketId, task.targetId, task.payload[0].params.volume);
                    await this.addVolumeBindingToDb(task.targetId, task.payload[0].params.volume.id, task.payload[0].params.bindTo == "k8s" ? "workspace" : "vm");
                    await this.parent.cleanUpClusterSnapshot(snapshotData);
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
                console.error(error);
                this.mqttController.logEvent(task.payload[0].socketId, "error", "An error occured while binding volume to cluster");
                if(snapshotData){
                    await this.parent.restoreClusterSnapshot(snapshotData);
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
     * processScheduledDeprovisionVolume
     * @param {*} task 
     */
    static async processScheduledDeprovisionVolume(task) {
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
                snapshotData = await this.parent.takeClusterSnapshot(task.targetId);
                await TaskGlusterController.deprovisionVolume(task.payload[0].socketId, task.payload[0].params.volumeId, task.payload[0].params.volumeName, task.payload[0].params.volumeSecret);
                await this.parent.cleanUpClusterSnapshot(snapshotData);
                this.mqttController.closeEventStream(task.payload[0].socketId);
            } else if(task.payload[0].params.type == "local"){
                snapshotData = await this.parent.takeClusterSnapshot(task.targetId);
                await this.detatchAndUnmountLocalVolumeFromClusterVMs(task.payload[0].socketId, task.payload[0].params.workspaceId, task.payload[0].params.volumeId);
                await this.deleteLocalVolumeFromClusterVMs(task.payload[0].socketId, task.payload[0].params.workspaceId, task.payload[0].params.volumeId);
                await DBController.removeVolume(task.payload[0].params.volumeId);
                await this.parent.cleanUpClusterSnapshot(snapshotData);
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
            console.error(error);
            if(snapshotData){
                await this.parent.restoreClusterSnapshot(snapshotData);
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
     * processScheduledProvisionVolume
     * @param {*} task 
     */
    static async processScheduledProvisionVolume(task) {
        task.payload = JSON.parse(task.payload);
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

                snapshotData = await this.parent.takeClusterSnapshot(task.targetId);

                this.mqttController.logEvent(task.payload[0].socketId, "info", "Provisioning Gluster volume");
                await TaskGlusterController.provisionVolume(task.targetId, task.id, task.payload[0].params.size, task.payload[0].params.replicas, task.payload[0].params.name, task.payload[0].params.type);
    
                await this.parent.cleanUpClusterSnapshot(snapshotData);
                
                await DBController.updateTaskStatus(task, "DONE", {
                    "type": "INFO",
                    "step": "PROVISIONING_GLUSTER_VOLUME",
                    "component": "task-controller",
                    "ts": new Date().toISOString()
                });
            } catch (err) {
                this.mqttController.logEvent(task.payload[0].socketId, "error", "An error occured while provisionning Gluster volume, rollback");
                if(snapshotData){
                    await this.parent.restoreClusterSnapshot(snapshotData);
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
                await this.declareLocalVolume(task.targetId, task.payload[0].params.name, task.payload[0].params.size, task.payload[0].params.type);

                await DBController.updateTaskStatus(task, "DONE", {
                    "type":"INFO",
                    "step":"PROVISIONNING_PV_VOLUME",
                    "component": "task-controller",
                    "ts":new Date().toISOString()
                });   
            } catch (error) {
                console.error(error);
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
     * declareLocalVolume
     * @param {*} data 
     * @param {*} workspaceId 
     * @param {*} name 
     * @param {*} size 
     * @param {*} type 
     */
    static async declareLocalVolume(workspaceId, name, size, type) {
        let hash = null;
        while(hash == null){
            hash = shortid.generate();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
        }
        let dbEntry = await DBController.createVolume(size, name, hash, workspaceId, type);
        return dbEntry;
    }

    /**
     * detatchAndUnmountLocalVolumeFromClusterVMs
     * @param {*} workspaceId 
     * @param {*} volumeId 
     * @param {*} downgradeNodeIds 
     */
    static async detatchAndUnmountLocalVolumeFromClusterVMs(socketId, workspaceId, volumeId) {
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let nodeProfiles = workspaceK8SNodes.map(n => {
            return {
                "node": n, 
                "host": allK8SHosts.find(h => h.id == n.k8sHostId)
            }
        });

        let volume = await DBController.getVolume(volumeId);
        try {
            for(let i=0; i<nodeProfiles.length; i++){
                this.mqttController.logEvent(socketId, "info", `Unmounting local volume from node ${i+1}/${nodeProfiles.length}`);
                await this.unmountK8SNodeLocalVolume(nodeProfiles[i], volume);
            }
        } catch (error) {
            this.mqttController.logEvent(socketId, "error", `An error occured detatching the volume, rollback`);
            throw error;
        }
        
        let successDetatch = [];
        try {
            for(let i=0; i<nodeProfiles.length; i++){
                this.mqttController.logEvent(socketId, "info", `Detatching local volume from node ${i+1}/${nodeProfiles.length}`);
                await this.detatchLocalVolumeFromVM(workspaceId, nodeProfiles[i], volumeId);
                successDetatch.push(nodeProfiles[i]);
            }
            await DBController.setVolumePortIndex(volumeId, null);
        } catch (error) {
            this.mqttController.logEvent(socketId, "error", `An error occured detatching the volume, rollback`);
            for(let i=0; i<successDetatch.length; i++) {
                try { await this.attachLocalVolumeToVM(workspaceId, successDetatch[i], volume); } catch (_e) {console.error(_e)}
            }
        }
    }

    /**
     * attachAndMountLocalVolumeToClusterVMs
     * @param {*} workspaceId 
     * @param {*} volume 
     * @param {*} target 
     * @param {*} upgradeNodeIds 
     */
    static async attachAndMountLocalVolumeToClusterVMs(socketId, workspaceId, volume) {
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let nodeProfiles = workspaceK8SNodes.map(n => {
            return {
                "node": n, 
                "host": allK8SHosts.find(h => h.id == n.k8sHostId)
            }
        });

        // Attach volume on all cluster VMs
        let successAttach = [];
        let successMounts = [];
        let mountFolderName = `${volume.name}-${volume.secret}`;
        try {
            for(let i=0; i<nodeProfiles.length; i++) {
                this.mqttController.logEvent(socketId, "info", `Attaching local volume to node ${i+1}/${nodeProfiles.length}`);
                await this.attachLocalVolumeToVM(workspaceId, nodeProfiles[i], volume);
                successAttach.push(nodeProfiles[i]);

                if(i == 0){
                    volume = await DBController.getVolume(volume.id); // To get updated portIndex
                }
                this.mqttController.logEvent(socketId, "info", `Mounting local volume to node ${i+1}/${nodeProfiles.length}`);
                let responseMount = await this.mqttController.queryRequestResponse(nodeProfiles[i].host.ip, "mount_local_volume", {
                    "node": nodeProfiles[i].node,
                    "volume": volume,
                    "mountFolderName": mountFolderName
                }, 60 * 1000 * 3);
                if(responseMount.data.status != 200){
                    const _error = new Error(responseMount.data.message);
                    _error.code = responseMount.data.status;
                    throw _error;
                }
                successMounts.push(nodeProfiles[i]);
            }
        } catch (error) {
            // this.mqttController.logEvent(socketId, "error", `An error occured while mounting local volume to nodes, rollback`);
            console.error(error);
            for(let i=0; i<successMounts.length; i++) {
                await this.mqttController.queryRequestResponse(successMounts[i].host.ip, "unmount_local_volume", {
                    "nodeProfile": successMounts[i],
                    "volumeMountName": mountFolderName
                }, 60 * 1000 * 3);
            }
            for(let i=0; i<successAttach.length; i++) {
                try{await this.detatchLocalVolumeFromVM(workspaceId, successAttach[i], volume.id);} catch(_e) {}
                // Update volume object
                volume = await DBController.getVolume(volume.id);
            }
            await DBController.setVolumePortIndex(volume.id, null);
            volume = await DBController.getVolume(volume.id); // To get updated portIndex
            throw error;
        }
    }

    /**
     * attachLocalVolumeToVM
     * @param {*} nodeProfile 
     * @param {*} volume 
     */
    static async attachLocalVolumeToVM(workspaceId, nodeProfile, volume) {
        let response = await this.mqttController.queryRequestResponse(nodeProfile.host.ip, "attach_local_volume_to_vm", {
            "nodeProfile": nodeProfile,
            "volume": volume,
            "workspaceId": workspaceId
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
        return response;
    }


    /**
     * detatchLocalVolumeFromVM
     * @param {*} nodeProfile 
     * @param {*} volume 
     */
    static async detatchLocalVolumeFromVM(workspaceId, nodeProfile, volumeId, skipRestart) {
        let response = await this.mqttController.queryRequestResponse(nodeProfile.host.ip, "detatch_local_volume_from_vm", {
            "volumeId": volumeId,
            "node": nodeProfile.node,
            "workspaceId": workspaceId,
            "delDiskFile": false,
            "skipRestart": skipRestart ? true : false
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
        return response;
    }

    /**
     * deleteLocalVolumeFromNode
     * @param {*} host 
     * @param {*} node 
     * @param {*} volumeId 
     */
    static async deleteLocalVolumeFromNode(host, node, volumeId) {
        let response = await this.mqttController.queryRequestResponse(host.ip, "delete_local_volume", {
            "volumeId": volumeId,
            "node": node,
            "workspaceId": node.workspaceId
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
        return response;
    }

    /**
     * deleteLocalVolumeFromClusterVMs
     * @param {*} workspaceId 
     * @param {*} volumeId 
     * @param {*} downgradeNodeIds 
     */
    static async deleteLocalVolumeFromClusterVMs(socketId, workspaceId, volumeId, downgradeNodeIds) {
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let nodeProfiles = workspaceK8SNodes.map(n => {
            return {
                "node": n, 
                "host": allK8SHosts.find(h => h.id == n.k8sHostId)
            }
        });

        try {
            for(let i=0; i<nodeProfiles.length; i++){
                if(!downgradeNodeIds || downgradeNodeIds.indexOf(nodeProfiles[i].node.id) != -1){
                    this.mqttController.logEvent(socketId, "info", `Deleting local volume from node ${i+1}/${nodeProfiles.length}`);
                    await this.deleteLocalVolumeFromNode(nodeProfiles[i].host, nodeProfiles[i].node, volumeId);
                }
            }
        } catch (error) {
            this.mqttController.logEvent(socketId, "error", `An error occured while deleting local volume from cluster VMs, rollback`);
            throw error;
        }
    }

    /**
     * removeVolumeBindingFromDb
     * @param {*} workspaceId 
     * @param {*} volumeId 
     * @param {*} target 
     */
    static async removeVolumeBindingFromDb(workspaceId, volumeId, target) {
        await DBController.removeVolumeBinding(
            target,
            workspaceId,
            volumeId
        );
    }

    /**
     * addVolumeBindingToDb
     * @param {*} workspaceId 
     * @param {*} volumeId 
     * @param {*} target 
     */
    static async addVolumeBindingToDb(workspaceId, volumeId, target) {
        await DBController.addVolumeBinding( 
            target,
            workspaceId,
            volumeId
        );
    }

    /**
     * unmountK8SNodeLocalVolume
     * @param {*} nodeProfile 
     * @param {*} volume 
     */
    static async unmountK8SNodeLocalVolume(nodeProfile, volume) {
        let response = await this.mqttController.queryRequestResponse(nodeProfile.host.ip, "unmount_local_volume", {
            "nodeProfile": nodeProfile,
            "volumeMountName": `${volume.name}-${volume.secret}`
        }, 60 * 1000 * 15);
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
        return response;
    }
}
TaskVolumeController.pendingResponses = {};
TaskVolumeController.bussyTaskIds = [];
module.exports = TaskVolumeController;