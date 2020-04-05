// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const { Forbidden } = require('@feathersjs/errors');
const path = require("path");

class TaskApplicationsController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;
    }

    /**
     * deployAppImage
     * @param {*} workspaceId 
     * @param {*} data 
     * @param {*} params 
     */
    static async deployAppImage(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }
       
        let appZipPath = path.join(process.env.APP_TMP_DIR, data.appFileName);

        await this.parent.schedule(
            "DEPLOY-IMAGE",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"DEPLOY-IMAGE",
                "socketId": data.socketId,
                "params":{
                    "appZipPath": appZipPath,
                    "workspaceId": data.workspaceId,
                    "image": data.image,
                    "version": data.version
                },
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }


    /**
     * listOrgRegistryImages
     * @param {*} workspaceId 
     */
    static async listOrgRegistryImages(workspaceId, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(workspaceId, params);
        if(r.code){
            return r;
        }
        
        r = await this.parent._getWorkspaceMasterNodes(workspaceId, params);
        if(r.code){
            return r;
        }
        
        let response = await MQTTController.queryRequestResponse(r.data[0].k8s_host.ip, "list_org_registry_images", {
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
     * deleteOrgRegistryImage
     * @param {*} workspaceId 
     * @param {*} image 
     * @param {*} params 
     */
    static async deleteOrgRegistryImage(workspaceId, image, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(workspaceId, params);
        if(r.code){
            return r;
        }

        await this.parent.schedule(
            "DELETE-IMAGE",
            "workspace",
            workspaceId,
            [{
                "type":"INFO",
                "step":"DELETE-IMAGE",
                "params":{
                    "image": image
                },
                "ts":new Date().toISOString()
            }],
            params
        );

        return {
            "code": 200
        };
    }

    /**
     * 
     * @param {*} data 
     * @param {*} params 
     */
    static async scheduleCreateApplication(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckNonExistanceByNameForWs(data.workspaceId, "applications", data.name, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        if(r) {
            return r;
        }

        await this.parent.schedule(
            "PROVISION-APPLICATION",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"PROVISION",
                "params": data,
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }

    /**
     * 
     * @param {*} data 
     * @param {*} params 
     */
    static async scheduleDeleteApplication(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }
       
        r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        if(r) {
            return r;
        }
        
        await this.parent.schedule(
            "DEPROVISION-APPLICATION",
            "workspace",
            workspaceId,
            [{
                "type":"INFO",
                "step":"DEPROVISION",
                "params": data,
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }

    /**
     * 
     * @param {*} workspaceId 
     * @param {*} params 
     */
    static async listApplications(workspaceId, params) {      
        let result = await this.app.service('applications').find({
            "query": {
                "workspaceId": workspaceId
            },
            "user": params.user
        });
        
        return {
            "code": 200,
            "data": result.data
        };
    }

}

TaskApplicationsController.app = null;
TaskApplicationsController.mqttController = null;

module.exports = TaskApplicationsController;