const OSController = require("../os/index");
const DBController = require("../db/index");

let portLetterMap = {
    1: 'b',
    2: 'c',
    3: 'd',
    4: 'e',
    5: 'f',
    6: 'g',
    7: 'h',
    8: 'i',
    9: 'j',
    10: 'k',
    11: 'l',
    12: 'm',
    13: 'n',
    14: 'o',
    15: 'p',
    16: 'q',
    17: 'r',
    18: 's',
    19: 't',
    20: 'u'
};

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

// const ssh = new node_ssh();
let EngineController;

class TaskVolumeController {
    
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
     * requestAttachLocalVolumeToVM
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestAttachLocalVolumeToVM(topicSplit, ip, data) {
        let volumeName = data.volume.name + "-" + data.volume.secret
        try {
            if(process.env.MP_MODE == "unipaas") {
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "bind volume"
                }));
            } else {
                let nextPortIndex = await EngineController.getNextSATAPortIndex(data.nodeProfile.node.hostname);
                if(nextPortIndex == null){
                    this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                        status: 500,
                        message: "No more port indexes available",
                        task: "bind volume"
                    }));
                    return;
                }

                await DBController.setVolumePortIndex(data.volume.id, nextPortIndex);
                await EngineController.attachLocalVolumeToVM(data.workspaceId, data.nodeProfile.node, volumeName, data.volume.size, nextPortIndex);
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "bind volume"
                }));
            }
        } catch (error) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "bind volume"
            }));
        }
    }

    /**
     * requestDetatchLocalVolumeFromVM
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDetatchLocalVolumeFromVM(topicSplit, ip, data) {
        try {
            let volume = await DBController.getVolume(data.volumeId);
            if(volume.portIndex == null){
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "detatch volume"
                }));
                return;
            }
            
            await EngineController.detatchLocalK8SVolume(data.node, volume.portIndex, data.delDiskFile, data.skipRestart);

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "detatch volume",
                data: data
            }));
        } catch (err) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "detatch volume",
                data: data
            }));
        }
    }

    /**
     * requestDeleteLocalVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeleteLocalVolume(topicSplit, ip, data) {
        try {
            let volume = await DBController.getVolume(data.volumeId);
            let volumeName = volume.name + "-" + volume.secret;
            await EngineController.cleanUpDeletedVolume(data.node, volumeName);

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete local volume",
                data: data
            }));
        } catch (err) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "delete local volume",
                data: data
            }));
        }
    }

    /**
     * requestUnmountK8SNodeLocalVolume
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestUnmountK8SNodeLocalVolume(topicSplit, ip, data) {
        try {
             await this.unmountVolume(data.nodeProfile.node, data.volumeMountName);
             
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
     * requestMountK8SNodeLocalVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestMountK8SNodeLocalVolume(topicSplit, ip, data) {
        try {
             await this.mountLocalVolume(data.node, data.mountFolderName, data.volume.portIndex);
             this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                 status: 200,
                 task: "mount volume",
                 data: data
             }));
         } catch (err) {
             console.error(err);
             this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                 status: err.code ? err.code : 500,
                 message: err.message,
                 task: "mount volume",
                 data: data
             }));
         }
    }

    /**
     * mountLocalVolume
     * @param {*} node 
     * @param {*} volumeName 
     * @param {*} portIndex 
     * @param {*} formatDisk 
     */
    static async mountLocalVolume(node, volumeName, portIndex) {
        if(process.env.MP_MODE == "unipaas") {
            let r = await OSController.sshExec(node.ip, `[ -d "/mnt/${volumeName}" ] && echo "y" || echo "n"`, true);
            if(r.code == 0 && r.stdout == "y") {
                return;
            }
            else if(r.code != 0){
                throw new Error("An error occured trying to mount volume");
            }

            // Mkdir
            r = await OSController.sshExec(node.ip, `sudo mkdir -p /mnt/${volumeName}`, true);
            if(r.code != 0) {
                throw new Error(r.stderr);
            }
            r = await OSController.sshExec(node.ip, `sudo chmod a+w /mnt/${volumeName}`, true);
            if(r.code != 0) {
                throw new Error(r.stderr);
            }
        } else {
            let r = await OSController.sshExec(node.ip, `test -d "/mnt/${volumeName}" && echo "y" || echo "n"`, true);
            if(r.code == 0 && r.stdout == "y") {
                r = await OSController.sshExec(node.ip, `mount | grep "${volumeName}"`, true);
                if(r.code == 0 && r.stdout.trim() != "") {
                    // throw new Error("Folder already mounted");
                    return;
                } 
            }
            else if(r.code != 0){
                throw new Error("An error occured trying to mount volume");
            }
            
            r = await OSController.sshExec(node.ip, `lsblk -f | grep 'sd${portLetterMap[portIndex]}' | grep 'xfs'`, true);
            if(r.stderr.trim().length == 0 && r.stdout.trim() == "") {
                // Format the disk
                let formatDiskCommand = `mkfs.xfs /dev/sd${portLetterMap[portIndex]}`;
                r = await OSController.sshExec(node.ip, formatDiskCommand, true);
                if(r.code != 0) {
                    throw new Error(r.stderr);
                }
            } else if(r.code != 0) {
                throw new Error(r.stderr);
            }

            // Mkdir
            r = await OSController.sshExec(node.ip, `mkdir -p /mnt/${volumeName}`, true);
            if(r.code != 0) {
                throw new Error(r.stderr);
            }
        
            // Update FSTab
            try {
                r = await OSController.sshExec(node.ip, `echo '/dev/sd${portLetterMap[portIndex]} /mnt/${volumeName} xfs defaults 1 2' >> /etc/fstab`, true);
                if(r.code != 0) {
                    await this.unmountVolume(node, volumeName);
                    throw new Error(r.stderr);
                }
            } catch (error) {
                await this.unmountVolume(node, volumeName);
                throw error;
            }
            
            await _sleep(5000);

            // Mount disk
            try {
                r = await OSController.sshExec(node.ip, `mount -a`, true);
                if(r.code != 0) {
                    await this.unmountVolume(node, volumeName);
                    throw new Error(r.stderr);
                }
            } catch (error) {
                await this.unmountVolume(node, volumeName);
                throw error;
            }
        }
    }

    /**
     * unmountVolume
     * @param {*} node 
     * @param {*} volumeName 
     */
    static async unmountVolume(node, volumeName) {
        let r = await OSController.sshExec(node.ip, `test -d "/mnt/${volumeName}" && echo "y" || echo "n"`, true);
        if(r.code == 0 && r.stdout == "y") {
            r = await OSController.sshExec(node.ip, `mount | grep "${volumeName}"`, true);
            // If volume mounted
            if(r.code == 0 && r.stdout.trim() != "") {
                await OSController.sshExec(node.ip, `sudo umount /mnt/${volumeName}`, true);
            }
            // If also declared in fstab, remove it from there as well
            r = await OSController.sshExec(node.ip, `cat /etc/fstab | grep "/mnt/${volumeName}"`, true);
            if(r.code == 0 && r.stdout.trim() != "") {
                await OSController.sshExec(node.ip, `sudo sed -i '\\|/mnt/${volumeName}|d' /etc/fstab`, true);
            }
            // Delete folders
            await OSController.sshExec(node.ip, `sudo rm -rf /mnt/${volumeName}`, true);
        } else if(r.code != 0) {
            throw new Error("An error occured trying to unmount volume");
        }
        else {
            console.log(`Nothing to unmount /mnt/${volumeName}`);
        }
    }
}
TaskVolumeController.ip = null;
module.exports = TaskVolumeController;