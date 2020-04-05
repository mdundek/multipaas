// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const { Forbidden } = require('@feathersjs/errors');

class TaskVolumeController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;
    }

    /**
     * scheduleCreateVolume
     * @param {*} workspaceId 
     * @param {*} flags 
     * @param {*} params 
     */
    static async scheduleCreateVolume(flags, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(flags.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckVolumeNonExistance(flags.workspaceId, flags.name, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckPermissionsOrgAdmin_ws(flags.workspaceId, params);
        if(r) {
            return r;
        }

        await this.parent.schedule(
            "PROVISION-VOLUME",
            "workspace",
            flags.workspaceId,
            [{
                "type":"INFO",
                "step":"PROVISION",
                "socketId": flags.socketId,
                "params":{
                    "name": flags.name,
                    "size": flags.size,
                    "type": flags.type,
                    "workspaceId": flags.workspaceId
                },
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }

    /**
     * scheduleDeleteVolume
     * @param {*} workspaceId 
     * @param {*} flags 
     * @param {*} params 
     */
    static async scheduleDeleteVolume(flags, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(flags.workspaceId, params);
        if(r.code){
            return r;
        }
       
        r = await this.parent._precheckPermissionsOrgAdmin_ws(flags.workspaceId, params);
        if(r) {
            return r;
        }

        r = await this.parent._precheckVolumeExistance(flags.workspaceId, flags.name, params);
        if(r.code){
            return r;
        }
        
        // Make sure no one uses the volume
        let volumleBindings = await this.app.service("volume-bindings").find({
            "query": {
                "volumeId": r.data[0].id
            },
            "user": params.user
        });
        
        if(volumleBindings.total != 0) {
            return { "code": 409 }
        }
        
        await this.parent.schedule(
            "DEPROVISION-VOLUME",
            "workspace",
            flags.workspaceId,
            [{
                "type":"INFO",
                "step":"DEPROVISION",
                "socketId": flags.socketId,
                "params":{
                    "volumeId": r.data[0].id,
                    "volumeName": r.data[0].name,
                    "volumeSecret": r.data[0].secret,
                    "workspaceId": flags.workspaceId,
                    "type": r.data[0].type,
                },
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }

    /**
     * scheduleBindVolume
     * @param {*} workspaceId 
     * @param {*} name 
     * @param {*} target 
     * @param {*} params 
     */
    static async scheduleBindVolume(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckVolumeExistance(data.workspaceId, data.name, params);
        if(r.code){
            return r;
        }

        if(data.target == "k8s") {
            // Make sure this volume is not already bound to this workspace cluster
            let volumleBindings = await this.app.service("volume-bindings").find({
                "query": {
                    // "volumeId": r.data[0].id,
                    "target": "workspace",
                    "targetId": data.workspaceId
                },
                "user": params.user
            });

            if(volumleBindings.total >= 20) {
                return { "code": 410 }
            }
            if(volumleBindings.data.find(o => o.volumeId == r.data[0].id)) {
                return { "code": 409 }
            }
        } else {
            // TODO: other targets are VM, to implement
            return { "code": 406 }
        }

        await this.parent.schedule(
            "BIND-VOLUME",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"BIND",
                "socketId": data.socketId,
                "params":{
                    "volume": r.data[0],
                    "target": "workspace",
                    "targetId": data.workspaceId,
                    "bindTo": data.target
                },
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }

    /**
     * scheduleUnbindVolume
     * @param {*} workspaceId 
     * @param {*} name 
     * @param {*} target 
     * @param {*} params 
     */
    static async scheduleUnbindVolume(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckVolumeExistance(data.workspaceId, data.name, params);
        if(r.code){
            return r;
        }
       
        if(data.target == "k8s") {
            // Make sure this volume is not already bound to this workspace cluster
            let volumleBindings = await this.app.service("volume-bindings").find({
                "query": {
                    "volumeId": r.data[0].id,
                    "target": "workspace",
                    "targetId": data.workspaceId
                },
                "user": params.user
            });
            if(volumleBindings.total == 0) {
                return { "code": 409 }
            }
        } else {
            // TODO: other targets are VM, to implement
            return { "code": 406 }
        }

        // Make sure no other resources are using this volume
        let allVolumeMasters = [];
        let volBindings = await DBController.getGlusteVolumeBindingsByVolumeId(r.data[0].id);
        for(let i=0; i<volBindings.length; i++) {
            if(volBindings[i].target == "workspace"){
                let otherWorkspaceNodes = await DBController.getAllK8sWorkspaceNodes(volBindings[i].targetId);
                let cMaster = otherWorkspaceNodes.find(o => o.nodeType == "MASTER");
                if(cMaster){
                    allVolumeMasters.push(cMaster);
                }
            } else {
                // TODO: If volume is also used by other type of resources, such as VMs
                return { "code": 500 }
            }
        }
        if(allVolumeMasters.length > 0) {
            let allK8SHosts = await DBController.getAllK8sHosts();
            for(let i=0; i<allVolumeMasters.length; i++){
                let host = allK8SHosts.find(o => o.id == allVolumeMasters[i].k8sHostId);
                let response = await MQTTController.queryRequestResponse(host.ip, "get_k8s_resources", {
                    "targets": ["pvc"],
                    "ns": "*",
                    "node": allVolumeMasters[i]
                }, 15000);
                if(response.data.status == 200){
                    let clusterHasPvc = response.data.output.pvc.find(pvc => {
                        let a = pvc.VOLUME.split("-");
                        return a.slice(0, a.length-2).join("-") == r.data[0].name;
                    });
                    if(clusterHasPvc){
                        return { "code": 410 };
                    }
                } else {
                    return { "code": response.data.status };
                }
            }
        }

        await this.parent.schedule(
            "UNBIND-VOLUME",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"UNBIND",
                "socketId": data.socketId,
                "params":{
                    "volume": r.data[0],
                    "target": "workspace",
                    "targetId": data.workspaceId,
                    "unbindFrom": data.target
                },
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }

    /**
     * getPersistedVolumes
     * @param {*} workspaceId 
     */
    static async getPersistedVolumes(workspaceId, data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(workspaceId, params);
        if(r.code){
            return r;
        }
        
        r = await this.parent._getWorkspaceMasterNodes(workspaceId, params);
        if(r.code){
            return r;
        }
       
        let response = await MQTTController.queryRequestResponse(r.data[0].k8s_host.ip, "get_k8s_resources", {
            "targets": ["pv", "pvc"],
            "ns": data.ns,
            "node": r.data[0]
        }, 15000);

        if(response.data.status == 200){
            return {
                "code": 200,
                "data": response.data.output
            };
        } else {
            return { "code": response.data.status };
        }
    }

    /**
     * getWorkspacesVolumes
     * @param {*} workspaceId 
     */
    static async getWorkspacesVolumes(workspaceId, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(workspaceId, params);
        if(r.code){
            return r;
        }
    
        // let k8sPersistedVolumes = await this.getPersistedVolumes(workspaceId, {"ns": "*"}, params);
        // if(k8sPersistedVolumes.code != 200){
        //     return { "code": k8sPersistedVolumes.code };
        // }

        // console.log(JSON.stringify(k8sPersistedVolumes, null, 4));

        let volumes = await this.app.service("volumes").find({
            "query": {
                "workspaceId": workspaceId
            },
            "user": params.user
        });

        let volumeBindings = await this.app.service("volume-bindings").find({
            "query": {
                "target": "workspace", 
                "targetId": workspaceId
            },
            "user": params.user
        });

        let services = await this.app.service("services").find({
            "query": {
                "volumeId": {
                    $in: volumes.data.map(o => o.id)
                }
            },
            "user": params.user
        });
        let applications = await this.app.service("applications").find({
            "query": {
                "volumeId": {
                    $in: volumes.data.map(o => o.id)
                }
            },
            "user": params.user
        });

        return { "code": 200, "data": volumes.data.map(v => {
            return {
                size: v.size,
                name: v.name,
                type: v.type,
                bindings: volumeBindings.data.filter(o => o.volumeId == v.id).map(o => {
                    if(o.target == "workspace"){
                        return {
                            "target": "k8s",
                            "services": services.data,
                            "applications": applications.data
                        };
                    } else {
                        // TODO: VMs in the future
                        return {
                            "target": "virtual machine"
                        };
                    }
                    
                })
            }
        }) };
    }
}

TaskVolumeController.app = null;
TaskVolumeController.mqttController = null;

module.exports = TaskVolumeController;