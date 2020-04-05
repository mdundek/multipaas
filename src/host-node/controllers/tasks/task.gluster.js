const OSController = require("../os/index");
const DBController = require("../db/index");
const shortid = require('shortid');
const path = require('path');
const YAML = require('yaml');
const fs = require('fs');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

// const ssh = new node_ssh();
let EngineController;

class TaskGlusterController {
    
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
     * provisionGlusterVolume
     * @param {*} data 
     * @param {*} workspaceId 
     * @param {*} name 
     * @param {*} size 
     * @param {*} type 
     */
    static async provisionGlusterVolume(gluster_targets, workspaceId, name, size, type) {
        let hash = null;
        while(hash == null){
            hash = shortid.generate();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
        }

        let volumeName = name + "-" + hash;

        // Create gluster volume on all peers
        try {
            let result = await OSController.execSilentCommand(`docker exec gluster-ctl gluster volume create ${volumeName} replica ${gluster_targets.length} ${gluster_targets.map(o => `${o}:/bricks/${volumeName}`).join(' ')} force`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
        } catch (error) {
            throw error;
        }

        // Start the gluster volume
        try {
            let result = await OSController.execSilentCommand(`docker exec gluster-ctl gluster volume start ${volumeName}`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
        } catch (error) {
            await OSController.execSilentCommand(`docker exec gluster-ctl bash -c "printf 'y\n' | gluster volume delete ${volumeName}"`);
            throw error;
        }

        // Configure the gluster volume
        try {
            let result = await OSController.execSilentCommand(`docker exec gluster-ctl gluster volume set ${volumeName} cluster.min-free-disk 10%`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
            result = await OSController.execSilentCommand(`docker exec gluster-ctl gluster volume quota ${volumeName} enable`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
            result = await OSController.execSilentCommand(`docker exec gluster-ctl gluster volume quota ${volumeName} limit-usage / ${size}MB`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
        } catch (error) {
            await OSController.execSilentCommand(`docker exec gluster-ctl bash -c "printf 'y\n' | gluster volume stop ${volumeName}"`);
            await OSController.execSilentCommand(`docker exec gluster-ctl bash -c "printf 'y\n' | gluster volume delete ${volumeName}"`);
            throw error;
        }

        // Update database
        try {
            let dbClient = await DBController.startTransaction();
            let dbEntry = await DBController.createGlusterVolume(size, name, hash, workspaceId, type, dbClient);
            for(let i=0; i<gluster_targets.length; i++) {
                let gip = gluster_targets[i];
                let dbHost = await DBController.getGlusterHostByIp(gip);
                await DBController.createGlusterVolumeReplica(dbEntry.id, dbHost.id, dbClient);
            }
            await DBController.commitTransaction(dbClient);
        } catch (error) {
            await OSController.execSilentCommand(`docker exec gluster-ctl bash -c "printf 'y\n' | gluster volume stop ${volumeName}"`);
            await OSController.execSilentCommand(`docker exec gluster-ctl bash -c "printf 'y\n' | gluster volume delete ${volumeName}"`);
            await DBController.rollbackTransaction(dbClient);
            throw error;
        }
    }

    /**
     * deprovisionGlusterVolume
     * @param {*} volumeId 
     * @param {*} name 
     * @param {*} secret 
     */
    static async deprovisionGlusterVolume(volumeId, name, secret) {
        let volumeName = name + "-" + secret;
        await OSController.execSilentCommand(`docker exec gluster-ctl bash -c "printf 'y\n' | gluster volume stop ${volumeName}"`);
        try {
            await OSController.execSilentCommand(`docker exec gluster-ctl bash -c "printf 'y\n' | gluster volume delete ${volumeName}"`);
        } catch (error) {
            await OSController.execSilentCommand(`docker exec gluster-ctl bash -c "printf 'y\n' | gluster volume start ${volumeName}"`);
            throw error;
        }
        await DBController.deleteGlusterVolume(volumeId);
    }

    /**
     * deleteDeprovisionnedGlusterDir
     * @param {*} name 
     * @param {*} secret 
     */
    static async deleteDeprovisionnedGlusterDir(name, secret) {
        await OSController.execSilentCommand(`rm -rf /bricks/${name + "-" + secret}`);
    }

    /**
     * authorizeGlusterVolumeIps
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async authorizeGlusterVolumeIps(topicSplit, ip, data) {
        try {
            let result = await OSController.execSilentCommand(`docker exec gluster-ctl gluster volume set ${data.volumeName} auth.allow ${data.ips.join(',')}`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "authorize volume ips",
                data: data
            }));
        } catch (error) {
            console.log(error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "authorize volume ips",
                data: data
            }));
        }
    }
}
TaskGlusterController.ip = null;
module.exports = TaskGlusterController;