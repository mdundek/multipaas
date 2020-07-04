const TaskVolumeController = require('./task.volume');

const OSController = require("../os/index");
const DBController = require("../db/index");

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

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
            EngineController = require("../engines/virtualbox/index");
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
            let _cmd = `sudo docker exec gluster-ctl gluster volume create ${volumeName} replica ${gluster_targets.length} ${gluster_targets.map(o => `${o}:/bricks/${volumeName}`).join(' ')} force`;
            let result = await OSController.execSilentCommand(_cmd);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
        } catch (error) {
            throw error;
        }

        // Start the gluster volume
        try {
            let result = await OSController.execSilentCommand(`sudo docker exec gluster-ctl gluster volume start ${volumeName}`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
        } catch (error) {
            await OSController.execSilentCommand(`sudo docker exec gluster-ctl bash -c "printf 'y\n' | sudo gluster volume delete ${volumeName}"`);
            throw error;
        }

        // Configure the gluster volume
        try {
            let result = await OSController.execSilentCommand(`sudo docker exec gluster-ctl gluster volume set ${volumeName} cluster.min-free-disk 10%`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
            result = await OSController.execSilentCommand(`sudo docker exec gluster-ctl gluster volume quota ${volumeName} enable`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
            result = await OSController.execSilentCommand(`sudo docker exec gluster-ctl gluster volume quota ${volumeName} limit-usage / ${size}MB`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
        } catch (error) {
            await OSController.execSilentCommand(`sudo docker exec gluster-ctl bash -c "printf 'y\n' | sudo gluster volume stop ${volumeName}"`);
            await OSController.execSilentCommand(`sudo docker exec gluster-ctl bash -c "printf 'y\n' | sudo gluster volume delete ${volumeName}"`);
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
            await OSController.execSilentCommand(`sudo docker exec gluster-ctl bash -c "printf 'y\n' | sudo gluster volume stop ${volumeName}"`);
            await OSController.execSilentCommand(`sudo docker exec gluster-ctl bash -c "printf 'y\n' | sudo gluster volume delete ${volumeName}"`);
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
        await OSController.execSilentCommand(`sudo docker exec gluster-ctl bash -c "printf 'y\n' | sudo gluster volume stop ${volumeName}"`);
        try {
            await OSController.execSilentCommand(`sudo docker exec gluster-ctl bash -c "printf 'y\n' | sudo gluster volume delete ${volumeName}"`);
        } catch (error) {
            await OSController.execSilentCommand(`sudo docker exec gluster-ctl bash -c "printf 'y\n' | sudo gluster volume start ${volumeName}"`);
            throw error;
        }
        await DBController.deleteGlusterVolume(volumeId);
    }

    /**
     * requestDeleteDeprovisionnedGlusterDir
     * @param {*} name 
     * @param {*} secret 
     */
    static async requestDeleteDeprovisionnedGlusterDir(name, secret) {
        await OSController.execSilentCommand(`rm -rf /bricks/${name + "-" + secret}`);
    }

    /**
     * requestAuthorizeGlusterVolumeIps
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestAuthorizeGlusterVolumeIps(topicSplit, ip, data) {
        try {
            let result = await OSController.execSilentCommand(`sudo docker exec gluster-ctl gluster volume set ${data.volumeName} auth.allow ${data.ips.join(',')}`);
            if(!(result.find(l => l.indexOf("success") != -1))) {
                throw new Error(result.join(" ; "));
            }
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "authorize volume ips",
                data: data
            }));
        } catch (error) {
            console.error(error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "authorize volume ips",
                data: data
            }));
        }
    }

    /**
     * requestProvisionGlusterVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestProvisionGlusterVolume(topicSplit, ip, data) {
        try{
             let dbHostNode = await DBController.getGlusterHostByIp(ip);
             if(!dbHostNode){
                 throw new Error("Could not find Gluster host entry in database");
             }
             await this.provisionGlusterVolume(data.gluster_targets, data.workspaceId, data.name, data.size, data.type);
             this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                 status: 200,
                 task: "provision gluster volume"
             }));
         } catch (_error) {
            console.error(_error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                 status: _error.code ? _error.code : 500,
                 message: _error.message,
                 task: "provision gluster volume"
            }));
         }   
    }

    /**
     * requestDeprovisionGlusterVolume
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeprovisionGlusterVolume(topicSplit, ip, data) {
        try{
            let volume = await DBController.getVolume(data.volumeId);
            await this.deprovisionGlusterVolume(volume.id, volume.name, volume.secret);

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deprovision gluster volume"
            }));
        } catch (_error) {
            console.error(_error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message,
                task: "deprovision gluster volume"
            }));
        }   
    }

    /**
     * requestMmountK8SNodeGlusterVolume
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestMountK8SNodeGlusterVolume(topicSplit, ip, data) {
        let volumeName = data.volume.name + "-" + data.volume.secret;
        let volumeGlusterHosts = null;
        try {
            volumeGlusterHosts = await DBController.getGlusterHostsByVolumeId(data.volume.id);
            if(volumeGlusterHosts.length == 0){
                throw new Error("The volume does not have any gluster peers");
            }
        } catch (err) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "bind volume"
            }));
            return;
        }
        
        try {
            await this.mountGlusterVolume(data.nodeProfile.node, volumeName, volumeGlusterHosts[0].ip);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "bind volume"
            }));
        } catch (error) {
            console.error(error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "bind volume"
            }));
        }
    }

    /**
     * requestUnmountK8SNodeGlusterVolume
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestUnmountK8SNodeGlusterVolume(topicSplit, ip, data) {
        let volumeName = data.volume.name + "-" + data.volume.secret;
        try {
            let volumeGlusterHosts = await DBController.getGlusterHostsByVolumeId(data.volume.id);
            if(volumeGlusterHosts.length == 0){
                throw new Error("The volume does not have any gluster peers");
            }
            await TaskVolumeController.unmountVolume(data.nodeProfile.node, volumeName);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "unbind volume",
                data: data
            }));
        } catch (err) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "unbind volume",
                data: data
            }));
        }
    }

    /**
     * mountGlusterVolume
     * @param {*} node 
     */ 
    static async mountGlusterVolume(node, volumeName, glusterIp) {
        let r = await OSController.sshExec(node.ip, `sudo test -d "/mnt/${volumeName}" && echo "y" || echo "n"`, true);
        if(r.code == 0 && r.stdout == "y") {
            r = await OSController.sshExec(node.ip, `sudo mount | grep "${volumeName}"`, true);
            if(r.code == 0 && r.stdout.trim() != "") {
                throw new Error("Folder already mounted");
            } 
        }   
        else if(r.code == 0 && r.stdout == "n") {
            r = await OSController.sshExec(node.ip, `sudo mkdir -p /mnt/${volumeName}`, true);
            if(r.code != 0) {
                throw new Error("Could not create mount folder");
            } 
        }
        else if(r.code != 0){
            throw new Error("An error occured trying to unmount volume");
        }

        r = await OSController.sshExec(node.ip, `sudo mount.glusterfs ${glusterIp}:/${volumeName} /mnt/${volumeName}`, true);
        if(r.code != 0) {
            await TaskVolumeController.unmountVolume(node, volumeName, glusterIp);
            throw new Error("Could not mount folder");
        }

        r = await OSController.sshExec(node.ip, `sudo chown -R vagrant:vagrant /mnt/${volumeName}`, true);
        if(r.code != 0) {
            await TaskVolumeController.unmountVolume(node, volumeName, glusterIp);
            throw new Error("Could not assign permissions on folder");
        }
        r = await OSController.sshExec(node.ip, `echo '${glusterIp}:/${volumeName}   /mnt/${volumeName}  glusterfs _netdev,auto,x-systemd.automount 0 0' | sudo tee -a /etc/fstab`, true);
        if(r.code != 0) {
            await TaskVolumeController.unmountVolume(node, volumeName, glusterIp);
            throw new Error("Could not update fstab");
        }
    }
}
TaskGlusterController.ip = null;
module.exports = TaskGlusterController;