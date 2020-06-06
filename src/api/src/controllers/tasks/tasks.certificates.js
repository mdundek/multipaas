// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const { Forbidden } = require('@feathersjs/errors');

class TaskCertificatesController {

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
    static async createCertificate(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        let existsResponse = await this.app.service("certificates").find({
            "query": {
                "domainId": data.domainId,
                "name": data.name
            },
            "user": params.user,
            "authentication": params.authentication
        });

        if(existsResponse.total != 0) {
            return { "code": 409 }
        }

        r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        if(r) {
            return r;
        }

        await this.app.service("certificates").create({
            name: data.name,
            domainId: data.domainId,
            key: data.key,
            crt: data.crt
        }, params);

        // TODO: Regenerate NGinx config file

        return { "code": 200 }
    }

    /**
     * 
     * @param {*} data 
     * @param {*} params 
     */
    static async deleteCertificate(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }
       
        r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        if(r) {
            return r;
        }

        await this.app.service("certificates").remove(data.certId, params);

        // TODO: Regenerate NGinx config file
        
        return { "code": 200 }
    }

    /**
     * 
     * @param {*} workspaceId 
     * @param {*} params 
     */
    static async listCertificates(organizationId, params) {    
        let orgs = await this.app.service('domains').find({
            "query": {
                "organizationId": organizationId
            },
            "user": params.user,
            "authentication": params.authentication
        });
        let domainIds = orgs.data.map(o => o.id);

        if(domainIds.length > 0){
            let result = await this.app.service('certificates').find({
                "query": {
                    "domainId": {
                        $in: domainIds
                    }
                },
                "user": params.user,
                "authentication": params.authentication
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

TaskCertificatesController.app = null;
TaskCertificatesController.mqttController = null;

module.exports = TaskCertificatesController;