// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const { Forbidden } = require('@feathersjs/errors');

class TaskRoutesController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;
    }

    /**
     * 
     * @param {*} data 
     * @param {*} params 
     */
    static async scheduleCreateRoute(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        if(r) {
            return r;
        }

        await this.parent.schedule(
            "PROVISION-ROUTE",
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
    static async scheduleDeleteRoute(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }
       
        r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        if(r) {
            return r;
        }

        // // Make sure no one uses the volume
        // let volumleBindings = await this.app.service("volume-bindings").find({
        //     "query": {
        //         "volumeId": r.data[0].id
        //     },
        //     "user": params.user
        // });
        
        // if(volumleBindings.total != 0) {
        //     return { "code": 409 }
        // }
        
        await this.parent.schedule(
            "DEPROVISION-ROUTE",
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
    static async listRoutes(workspaceId, params) {        
        let wsList = await this.app.service('applications').find({
            "query": {
                "workspaceId": workspaceId
            },
            "user": params.user
        });
        let appIds = wsList.data.map(o => o.id);

        if(appIds.length > 0){
            result = await this.app.service('routes').find({
                "query": {
                    "applicationId": {
                        $in: appIds
                    }
                },
                "user": params.user
            });
            
            return {
                "code": 200,
                "data": result.data
            };
        } else {
            return {
                "code": 200,
                "data": []
            };
        }
    }
}

TaskRoutesController.app = null;
TaskRoutesController.mqttController = null;

module.exports = TaskRoutesController;