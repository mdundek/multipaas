const DBController = require('../db/index');

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class TaskGlusterController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
    }

    /**
     * registerMissingGlusterHosts
     * @param {*} allDbHosts 
     * @param {*} memArray 
     */
    static async registerMissingGlusterHosts(allDbHosts, sizeArray) {
        // Make sure all hosts are registered
        for(let i=0; i<sizeArray.length; i++){                           
            if(!allDbHosts.find(dbh => dbh.ip == sizeArray[i].ip)){
                await DBController.createGlusterHost(
                    sizeArray[i].ip,
                    sizeArray[i].hostname,
                    "READY"
                );
            }
        }
    }

    /**
     * provisionVolume
     * @param {*} workspaceId 
     * @param {*} taskId 
     * @param {*} size 
     * @param {*} replicas 
     * @param {*} name 
     * @param {*} type 
     */
    static async provisionVolume(workspaceId, taskId, size, replicas, name, type) {
        let spaceArray = await this.parent.collectDiskSpaceFromGlusterNetwork();
        let allDbHosts = await DBController.getAllGlusterHosts();
        await TaskGlusterController.registerMissingGlusterHosts(allDbHosts, spaceArray);
        if(spaceArray.length > 1){
            spaceArray = spaceArray.filter(o => o.space > (size + 1024));
            replicas = replicas ? replicas : 2;
            if(spaceArray.length >= replicas){
                spaceArray = spaceArray.splice(0, replicas);
                let response = await this.mqttController.queryRequestResponse(spaceArray[0].ip, "provision_gluster_volume", {
                    "taskId": taskId,
                    "gluster_targets": spaceArray.map(o => o.ip),
                    "workspaceId": workspaceId,
                    "name": name,
                    "type": type,
                    "size": size
                }, 60 * 1000 * 15);               
                if(response.data.status != 200){
                    const error = new Error(response.data.message);
                    error.code = response.data.status;
                    throw error;
                }
            } else {
                this.mqttController.client.publish('/multipaas/alert/out_of_resources/volumes');
                const error = new Error("Out of resources");
                error.code = response.data.status;
                throw error;
            }
        }
        else {
            this.mqttController.client.publish('/multipaas/alert/not_enougth_gluster_peers');
            const error = new Error("Not enougth gluster nodes");
            error.code = response.data.status;
            throw error;
        }
    }

    /**
     * deprovisionVolume
     * @param {*} taskId 
     * @param {*} volumeId 
     */
    static async deprovisionVolume(socketId, volumeId, name, secret) {
        let volumeGlusterHosts = await DBController.getGlusterHostsByVolumeId(volumeId);
        if(volumeGlusterHosts.length > 0){
            this.mqttController.logEvent(socketId, "info", "Deprovisioning Gluster volume");
            let response = await this.mqttController.queryRequestResponse(volumeGlusterHosts[0].ip, "deprovision_gluster_volume", {
                "volumeId": volumeId
            }, 60 * 1000 * 15);
           
            if(response.data.status == 200) {
                for(let i=0; i<volumeGlusterHosts.length; i++){
                    this.mqttController.logEvent(socketId, "info", `Cleaning up Gluster volume files on node ${i+1}/${volumeGlusterHosts.length}`);
                    this.mqttController.client.publish(`/multipaas/k8s/host/query/${volumeGlusterHosts[i].ip}/delete_gluster_volume_dir`, JSON.stringify({
                        "name": name,
                        "secret": secret
                    }));
                }
            } else {
                this.mqttController.logEvent(socketId, "error", "An error occured while deprovisioning Gluster volume");
                const error = new Error(response.data.message);
                error.code = response.data.status;
                throw error;
            }
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
                try { await this.unmountK8SNodeGlusterVolume(successMounts[i], volume); } catch (_error) { console.error(_error); }
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
                try { await this.mountK8SNodeGlusterVolume(successUnmounts[i], volume); } catch (_) {console.error(_e)}
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
            console.error(error);
            this.mqttController.logEvent(socketId, "info", `An error occured setting Gluster authorized IPs, rollback`);
            for(let i=0; i<successUnmounts.length; i++) {
                try { await this.mountK8SNodeGlusterVolume(successUnmounts[i], volume); } catch (_e) {console.error(_e)}
            }
            throw error;
        }     
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
}
TaskGlusterController.pendingResponses = {};
TaskGlusterController.bussyTaskIds = [];
module.exports = TaskGlusterController;