// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const { Forbidden } = require('@feathersjs/errors');

class TaskDomainsController {

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
    static async createDomain(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckNonExistanceByNameForOrg(data.organizationId, "domains", data.name, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        if(r) {
            return r;
        }

        console.log(params);

        await this.app.service("domains").create({
            name: data.name,
            organizationId: data.organizationId
        }, params);

        return { "code": 200 }
    }

    /**
     * 
     * @param {*} data 
     * @param {*} params 
     */
    static async deleteDomain(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }
       
        r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        if(r) {
            return r;
        }
        
        // Make sure no one uses the resource
        let routes = await this.app.service("routes").find({
            "query": {
                "domainId": data.domainId
            },
            "user": params.user
        });
        
        if(routes.total != 0) {
            return { "code": 409 }
        }

        await this.app.service("domains").remove(data.domainId, params);
        
        return { "code": 200 }
    }

    /**
     * 
     * @param {*} workspaceId 
     * @param {*} params 
     */
    static async listDomains(organizationId, params) {     
        let orgs = await this.app.service('domains').find({
            "query": {
                "organizationId": organizationId
            },
            "user": params.user
        });
        
        return {
            "code": 200,
            "data": orgs.data
        };
    }
}

TaskDomainsController.app = null;
TaskDomainsController.mqttController = null;

module.exports = TaskDomainsController;