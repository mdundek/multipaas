// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const { Forbidden } = require('@feathersjs/errors');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class TaskPvcController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;
    }

    /**
     * createPVC
     * @param {*} data 
     * @param {*} params 
     */
    static async createPVC(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }
        r = await this.parent._getWorkspaceMasterNodes(data.workspaceId, params);
        if(r.code){
            return r;
        }
        let k8s_nodes = await this.app.service('k8s_nodes').find({
            "query": {
                "workspaceId": data.workspaceId
            },
            "user": params.user
        });
        let masterNode = k8s_nodes.data.find(k => k.nodeType == "MASTER");

        let hash = null;
        while(hash == null){
            hash = shortid.generate();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
        }
        hash = hash.toLowerCase();

        let volume = null
        try {
            volume = await DBController.getVolumeByName(data.workspaceId, data.volumeName);
        } catch (error) {
            console.log(error);
            return { "code": 500 }
        }

        let pvName = `usr-${data.name}-pv`;
        let pvcName = `usr-${data.name}-pvc`;
        // Make sure the PVC name does not exist yet
        let responsePvcs = await MQTTController.queryRequestResponse(masterNode.k8s_host.ip, "get_k8s_resources", {
            "targets": ["pvc"],
            "ns": data.ns,
            "node": masterNode
        }, 15000);
        if(responsePvcs.data.status == 200){
            if(responsePvcs.data.output.pvc.find(o => o.NAME == pvcName)) {
                return { "code": 409 };
            }
        }

        try {
            // Create PV 
            let responsePv = await this.mqttController.queryRequestResponse(masterNode.k8s_host.ip, "deploy_k8s_persistant_volume", {
                "node": masterNode,
                "host": masterNode.k8s_host,
                "pvName": pvName,
                "subFolderName": `ns-${data.ns}-${data.name}`,
                "volume": volume,
                "ns": data.ns,
                "size": data.pvcSize,
                "hostnames": k8s_nodes.data.map(o =>o.hostname),
                "workspaceId": data.workspaceId
            }, 60 * 1000 * 15);
            if(responsePv.data.status != 200){
                const error = new Error(responsePv.data.message);
                error.code = responsePv.data.status;
                throw error;
            }
        } catch (error) {
            console.log(error);
            return { "code": 500 }
        }

        try {
            // Now PVC
            let responsePvc = await this.mqttController.queryRequestResponse(masterNode.k8s_host.ip, "deploy_k8s_persistant_volume_claim", {
                "pvName": pvName,
                "pvcName": pvcName,
                "ns": data.ns,
                "size": `${data.pvcSize}Mi`,
                "node": masterNode,
                "workspaceId": data.workspaceId
            }, 60 * 1000 * 5);
            
            if(responsePvc.data.status != 200){
                const error = new Error(responsePvc.data.message);
                error.code = responsePvc.data.status;
                throw error;
            }
        } catch (error) {
            console.log(error);
            await this.mqttController.queryRequestResponse(masterNode.k8s_host.ip, "deprovision_pv", {
                "pvName": pvName,
                "volume": volume,
                "ns": data.ns,
                "subFolderName": `${data.ns}-${data.name}`,
                "node": masterNode
            }, 60 * 1000 * 5);

            return { "code": 500 }
        }
        
        return { "code": 200, "data": `/mnt/${volume.name}-${volume.secret}/ns-${data.ns}-${data.name}` }
    }

    /**
     * deletePVC
     * @param {*} data 
     * @param {*} params 
     */
    static async deletePVC(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._getWorkspaceMasterNodes(data.workspaceId, params);
        if(r.code){
            return r;
        }
       
        let response = await MQTTController.queryRequestResponse(r.data[0].k8s_host.ip, "get_k8s_resources", {
            "targets": ["pvc", "pods"],
            "ns": data.ns,
            "node": r.data[0],
            "json": true
        }, 15000);
        if(response.data.status == 200){
            let pvcK8SObject = response.data.output.pvc.items.find(o => o.metadata.name == data.name);

            if(!pvcK8SObject) {
                return { "code": 404 };
            }
           
            let pvName = data.name.substring(0, data.name.length-1);
            let pvcName = data.name;

            let dependantPods = response.data.output.pods.items.find(o => {
                return o.spec.volumes.find(k => k.name == "data" && k.persistentVolumeClaim.claimName == pvcName);
            });
            if(dependantPods){
                return { "code": 409 };
            }
            
            let volumePathResponse = await MQTTController.queryRequestResponse(r.data[0].k8s_host.ip, "get_k8s_resource_values", {
                "target": "pv",
                "targetName": pvName,
                "ns": data.ns,
                "jsonpath": "{@.spec.local.path}",
                "node": r.data[0]
            }, 15000);
            
            if(volumePathResponse.data.status == 200){
                let volMountPath = volumePathResponse.data.output[0];
                let volMountPathSplit = volMountPath.split("/").filter(o => o.length > 0);
                let volHash = volMountPathSplit[1].split("-");
                volHash = volHash[volHash.length-1];

                let volume = await DBController.getVolumeByHash(data.workspaceId, volHash);
                if(volume){
                    let delR = await this.mqttController.queryRequestResponse(r.data[0].k8s_host.ip, "deprovision_pvc", {
                        "pvcName": pvcName,
                        "ns": data.ns,
                        "node": r.data[0]
                    }, 60 * 1000 * 5);
                    if(delR.data.status != 200){
                        return { "code": delR.data.status };
                    }

                    delR = await this.mqttController.queryRequestResponse(r.data[0].k8s_host.ip, "deprovision_pv", {
                        "pvName": pvName,
                        "ns": data.ns,
                        "volume": volume,
                        "subFolderName": volMountPathSplit[2],
                        "node": r.data[0]
                    }, 60 * 1000 * 5);
                    if(delR.data.status != 200){
                        await this.mqttController.queryRequestResponse(r.data[0].k8s_host.ip, "deploy_k8s_persistant_volume_claim", {
                            "pvName": pvName,
                            "pvcName": pvcName,
                            "ns": data.ns,
                            "size": pvcK8SObject.status.capacity.storage,
                            "node": r.data[0],
                            "workspaceId": data.workspaceId
                        }, 60 * 1000 * 5);
                        return { "code": delR.data.status };
                    }
                    return { "code": 200 };
                } else {
                    return { "code": 404 };
                }
            } else {
                return { "code": 404 };
            }
        } else {
            return { "code": response.data.status };
        }
    }

    /**
     * listPVCs
     * @param {*} data 
     * @param {*} params 
     */
    static async listPVCs(data, params) {    
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckClusterAvailability(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._getWorkspaceMasterNodes(data.workspaceId, params);
        if(r.code){
            return r;
        }
       
        let response = await MQTTController.queryRequestResponse(r.data[0].k8s_host.ip, "get_k8s_resources", {
            "targets": ["pvc"],
            "ns": data.ns,
            "node": r.data[0]
        }, 15000);

        if(response.data.status == 200){
            return {
                "code": 200,
                "data": response.data.output.pvc
            };
        } else {
            return { "code": response.data.status };
        }
    }
}

TaskPvcController.app = null;
TaskPvcController.mqttController = null;

module.exports = TaskPvcController;