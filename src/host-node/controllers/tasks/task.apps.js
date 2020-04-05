const OSController = require("../os/index");
const DBController = require("../db/index");
const shortid = require('shortid');
const path = require('path');
const YAML = require('yaml');
const fs = require('fs');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');
var extract = require('extract-zip');

// const ssh = new node_ssh();
let EngineController;

class TaskAppsController {
    
    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;

        // Prepare the environment scripts
        if(process.env.CLUSTER_ENGINE == "virtualbox") {
            EngineController = require("./engines/vb/index");
        }
    }

    /**
     * _unzip
     * @param {*} zipFile 
     * @param {*} targetDir 
     */
    static _unzip(zipFile, targetDir) {
        return new Promise((resolve, reject) => {
            extract(zipFile, {dir: targetDir}, function (err) {
                if(err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    /**
     * buildPublishImage
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async buildPublishImage(topicSplit, data) {
        let tmpZipFile = null;
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);
            let acc = await DBController.getAccountForOrg(org.id);
            
            this.mqttController.logEvent(data.socketId, "info", "Preparing build artefacts");

            let response = await this.mqttController.queryRequestResponse("api", "get_app_source_zip", {
                "zipPath": data.zipPath,
                "delete": true
            }, 1000 * 60 * 5);
            if(response.data.status != 200){
                this.mqttController.logEvent(data.socketId, "error", "An error occured while getching image files");
                throw new Error("Could not get app source zip file");
            }  
           
            tmpZipFile = path.join(require('os').homedir(), ".mycloud", path.basename(data.zipPath));
            await OSController.writeBinaryToFile(tmpZipFile, response.data.data);

            // this.mqttController.logEvent(data.socketId, "info", "Building image");
            await EngineController.buildAndPushAppImage(data.node, tmpZipFile, data.imageName, data.imageVersion, org.name, acc.name, org.registryUser, rPass, (log, err) => {
                if(log){
                    this.mqttController.logEvent(data.socketId, "info", log);
                } else if(err) {
                    console.log("ERROR 1");
                    this.mqttController.logEvent(data.socketId, "error", err);
                }
            });

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "build image"
            }));

            // curl -k -X GET https://registry_user:registry_pass@192.168.0.98:5000/v2/_catalog
            // curl -k -X GET https://registry_user:registry_pass@192.168.0.98:5000/v2/oasis/sdfgsdfg/tags/list 
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "build image"
            }));
        } finally {
            if(fs.existsSync(tmpZipFile)){
                OSController.rmrf(tmpZipFile);
            }
        }
    }

    /**
     * getOrgRegistryImages
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async getOrgRegistryImages(topicSplit, data) {
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);
            let acc = await DBController.getAccountForOrg(org.id);
            
            let r = await EngineController.getRegistryImages(data.node, org.name, acc.name, org.registryUser, rPass);
           
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "list images",
                output: r
            }));
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "list images"
            }));
        }
    }

    /**
     * deleteRegistryImages
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async deleteRegistryImages(topicSplit, data) {
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);
            
            await EngineController.deleteRegistryImage(data.node, data.imageName, org.registryUser, rPass);
           
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete images"
            }));
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "delete images"
            }));
        }
    }
}
TaskAppsController.ip = null;
module.exports = TaskAppsController;