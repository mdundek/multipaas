const OSController = require("../os/index");
const DBController = require("../db/index");
const shortid = require('shortid');
const path = require('path');
const YAML = require('yaml');
const crypto = require('crypto');
const fs = require('fs');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

const TaskRuntimeController = require('./task.runtime');
const TaskGlusterController = require('./task.gluster');
const TaskServicesController = require('./task.services');
const TaskPvVolumeController = require('./task.volume_pv');
const TaskAppsController = require('./task.apps');

// const ssh = new node_ssh();
let EngineController;

class TaskController {
    
    /**
     * init
     */
    static init(mqttController) {
        this.mqttController = mqttController;

        // Prepare the environment scripts
        (async () => {
            this.ip = await OSController.getIp();

            if(process.env.CLUSTER_ENGINE == "virtualbox") {
                EngineController = require("./engines/vb/index");
            }
            await EngineController.init(this.mqttController);

            TaskRuntimeController.init(this, this.mqttController);
            TaskGlusterController.init(this, this.mqttController);
            TaskServicesController.init(this, this.mqttController);
            TaskPvVolumeController.init(this, this.mqttController);
            TaskAppsController.init(this, this.mqttController);

            setInterval(() => {
                // EngineController.ensureNodesStarted();
            }, 2 * 60 * 1000); // Every 2 minutes
            // EngineController.ensureNodesStarted();

            setInterval(() => {
                this.maintenance();
            }, 10 * 60 * 1000); // Every 10 minutes
        })();
    }

    /**
     * maintenance
     */
    static async maintenance(){
        // TODO: 

        // Get all masters and workers that are suposed to be deployed on this node
        // Have DB worker node but missing Worker VM:
        //   make sure the master (wherever it is) deprovisions this worker node
        // Have DB master node but missing Master VM:
        //   Look up all worker nodes for this master, delete their VMs & DB node entries
        // Remove node DB entry
        // Create new provisioning task in DB for task controller, and fire new task event
        
        // Get all VMs from this host
        // if VM has no Node DB entry & no PENDING or IN_PROGRESS task associated to it, delete VM
    }

    /**
     * takeNodeSnapshot
     * @param {*} ip 
     * @param {*} data 
     */
    static async takeNodeSnapshot(topicSplit, ip, data) {
        try{
            let snapshotName = await EngineController.takeSnapshot(data.node);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "take snapshot",
                snapshot: snapshotName
            }));
        } catch (_error) {
            console.log(_error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message,
                task: "take snapshot"
            }));
        }   
    }

    /**
     * createK8SResource
     * @param {*} ip 
     * @param {*} data 
     */
    static async createK8SResource(topicSplit, data) {
        try{
            await EngineController.kubectl(`kubectl create ${data.type} ${data.name}${data.ns ? " --namespace=" + data.ns : ""}`, data.node);

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "create k8s resource"
            }));
        } catch (_error) {
            console.log(_error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message,
                task: "create k8s resource"
            }));
        }   
    }

    /**
     * restoreNodeSnapshot
     * @param {*} ip 
     * @param {*} data 
     */
    static async restoreNodeSnapshot(topicSplit, ip, data) {
        try{
            await EngineController.restoreSnapshot(data.node, data.snapshot);
            if(topicSplit.length == 7){
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "restore snapshot"
                }));
            }
        } catch (_error) {
            console.log(_error);
            if(topicSplit.length == 7){
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: _error.code ? _error.code : 500,
                    message: _error.message,
                    task: "restore snapshot"
                }));
            }
        }   
    }

    /**
     * deleteNodeSnapshot
     * @param {*} ip 
     * @param {*} data 
     */
    static async deleteNodeSnapshot(topicSplit, ip, data) {
        try{
            await EngineController.deleteSnapshot(data.node, data.snapshot);
            if(topicSplit.length == 7){
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "delete snapshot"
                }));
            }
        } catch (_error) {
            console.log(_error);
            if(topicSplit.length == 7){
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: _error.code ? _error.code : 500,
                    message: _error.message,
                    task: "delete snapshot"
                }));
            }
        }   
    }

    /**
     * provisionGlusterVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async provisionGlusterVolume(topicSplit, ip, data) {
        let task = await DBController.getTaskById(data.taskId);
        if(task.status == "IN_PROGRESS" || task.status == "DONE"){
            return;
        }

        try{
            let dbHostNode = await DBController.getGlusterHostByIp(ip);
            if(!dbHostNode){
                throw new Error("Could not find Gluster host entry in database");
            }
            await TaskGlusterController.provisionGlusterVolume(data.gluster_targets, data.workspaceId, data.name, data.size, data.type);

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "provision gluster volume"
            }));
        } catch (_error) {
            console.log(_error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message,
                task: "provision gluster volume"
            }));
        }   
    }

    /**
     * deprovisionGlusterVolume
     * @param {*} ip 
     * @param {*} data 
     */
    static async deprovisionGlusterVolume(topicSplit, ip, data) {
        try{
            let volume = await DBController.getVolume(data.volumeId);
            await TaskGlusterController.deprovisionGlusterVolume(volume.id, volume.name, volume.secret);

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deprovision gluster volume"
            }));
        } catch (_error) {
            console.log(_error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message,
                task: "deprovision gluster volume"
            }));
        }   
    }

    /**
     * deployWorkspaceCluster
     * @param {*} ip 
     * @param {*} data 
     */
    static async deployWorkspaceCluster(topicSplit, ip, data) {
        let task = await DBController.getTaskById(data.taskId);
        task.payload = JSON.parse(task.payload);
        try {
            await TaskRuntimeController.deployWorkspaceCluster(data.socketId, ip, task.targetId);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "create workspace cluster"
            }));
        } catch (_error) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message ? _error.message : "An error occured",
                task: "create workspace cluster"
            }));
        } 
    }

    /**
     * decrypt
     * @param {*} pass 
     * @param {*} salt 
     */
    static decrypt(encryptedVal, salt) {
        let iv = Buffer.from(salt, 'base64');
        let encryptedText = Buffer.from(encryptedVal, 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(process.env.CRYPTO_KEY, 'base64'), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
}
TaskController.ip = null;
module.exports = TaskController;