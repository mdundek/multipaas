// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const { Forbidden } = require('@feathersjs/errors');
const TaskKeycloakController = require("./tasks.keycloak");
const crypto = require('crypto');
let key = Buffer.from(process.env.CRYPTO_KEY, 'base64');

class TaskNamespaceController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;
    }

    /**
     * createNamespace
     * @param {*} data 
     * @param {*} params 
     */
    static async createNamespace(data, params) {
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
            "targets": ["namespaces"],
            "node": r.data[0]
        }, 15000);
        
        if(response.data.status == 200){
            if(response.data.output.namespaces.find(o => o.NAME == data.name)) {
                return { "code": 409 }
            } else {
                
                params._internalRequest = true;
                let ws = await this.app.service("workspaces").get(data.workspaceId, params);
                params._internalRequest = true;
                let org = await this.app.service("organizations").get(ws.organizationId, params);
                params._internalRequest = true;
                let acc = await this.app.service("accounts").get(org.accountId, params);
                
                let allGroups = await TaskKeycloakController.getAvailableClusterGroups({
                    accName: acc.name,
                    orgName: org.name,
                    wsName: ws.name
                });
               
                if(allGroups.code != 200) {
                    return { "code": 500 }
                }
                
                // Decrypt registry password
                let iv = Buffer.from(org.bcryptSalt, 'base64');
                let encryptedText = Buffer.from(org.registryPass, 'hex');
                let decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                let decrypted = decipher.update(encryptedText);
                decrypted = Buffer.concat([decrypted, decipher.final()]);
           
                response = await MQTTController.queryRequestResponse(r.data[0].k8s_host.ip, "create_k8s_resource", {
                    "type": "namespace",
                    "name": data.name,
                    "node": r.data[0],
                    "clusterBaseGroup": `${acc.name}-${org.name}-${ws.name}`,
                    "registry": {
                        "server": "registry.multipaas.org",
                        "username": org.registryUser,
                        "password": decrypted.toString(),
                        "email": params.user.email
                    },
                    "groups": allGroups.data
                }, 25000);
                if(response.data.status == 200){
                    return { "code": 200 }
                } else {
                   return { "code": response.data.status }
                }
            }
        } else {
            return { "code": response.data.status }
        }
    }

    /**
     * deleteNamespace
     * @param {*} data 
     * @param {*} params 
     */
    static async deleteNamespace(data, params) {
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
       
        // TODO: Implement
        
        return { "code": 200 }
    }

    /**
     * listNamespaces
     * @param {*} data 
     * @param {*} params 
     */
    static async listNamespaces(data, params) {    
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
            "targets": ["namespaces"],
            "node": r.data[0]
        }, 15000);
        
        if(response.data.status == 200){
            return {
                "code": 200,
                "data": response.data.output.namespaces.filter(o => [
                    "default",
                    "kube-node-lease",
                    "kube-public",
                    "kube-system",
                    "nginx-ingress",
                    "local-path-storage"
                ].indexOf(o.NAME) == -1)
            };
        } else {
            return { "code": response.data.status };
        }
    }
}

TaskNamespaceController.app = null;
TaskNamespaceController.mqttController = null;

module.exports = TaskNamespaceController;