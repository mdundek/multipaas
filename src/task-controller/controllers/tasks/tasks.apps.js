const DBController = require('../db/index');
const OSController = require('../os/index');
const TaskVolumeController = require('./tasks.volume');
const TaskRuntimeController = require('./tasks.runtime');
const YAML = require('yaml');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class TaskAppsController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
    }

    /**
     * buildImage
     * @param {*} socketId 
     * @param {*} workspaceId 
     * @param {*} zipPath 
     * @param {*} imageName 
     * @param {*} imageVersion 
     */
    static async buildImage(socketId, workspaceId, zipPath, imageName, imageVersion) {
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        // Instruct node host to build and push image
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "build_publish_k8s_image", {
            "zipPath": zipPath,
            "imageName": imageName,
            "imageVersion": imageVersion,
            "node": node,
            "socketId": socketId
        }, 60 * 1000 * 15);
        
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }

    /**
     * deleteImage
     * @param {*} workspaceId 
     * @param {*} imageNameAndTag 
     */
    static async deleteImage(workspaceId, imageName) {
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        // Instruct node host to build and push image
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "delete_k8s_image", {
            "imageName": imageName,
            "node": node
        }, 60 * 1000 * 15);
        
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }
}
TaskAppsController.pendingResponses = {};
TaskAppsController.bussyTaskIds = [];
module.exports = TaskAppsController;