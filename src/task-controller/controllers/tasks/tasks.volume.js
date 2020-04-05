const DBController = require('../db/index');
const OSController = require('../os/index');
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
                try { await this.attachLocalVolumeToVM(workspaceId, successDetatch[i], volume); } catch (_) {console.log(_e)}
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
            this.mqttController.logEvent(socketId, "error", `An error occured while mounting local volume to nodes, rollback`);
            console.log(error);
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