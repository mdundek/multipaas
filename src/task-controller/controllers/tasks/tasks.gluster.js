const DBController = require('../db/index');
const OSController = require('../os/index');
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
                this.mqttController.client.publish('/mycloud/alert/out_of_resources/volumes');
                const error = new Error("Out of resources");
                error.code = response.data.status;
                throw error;
            }
        }
        else {
            this.mqttController.client.publish('/mycloud/alert/not_enougth_gluster_peers');
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
                    this.mqttController.client.publish(`/mycloud/k8s/host/query/${volumeGlusterHosts[i].ip}/delete_gluster_volume_dir`, JSON.stringify({
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
}
TaskGlusterController.pendingResponses = {};
TaskGlusterController.bussyTaskIds = [];
module.exports = TaskGlusterController;