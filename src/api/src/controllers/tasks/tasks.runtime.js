// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
// const DBController = require("../db/index");
const { NotFound, Unprocessable } = require('@feathersjs/errors');
// const Permissions = require('../../lib/permission_helper');

class TaskRuntimeController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;
    }

    /**
     * scheduleK8SConfig
     * @param {*} workspaceId 
     * @param {*} replicas 
     */
    static async scheduleK8SConfig(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        await this.parent.schedule(
            "UPDATE-K8S-CLUSTER",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"CONFIG",
                "socketId": data.socketId,
                "flags": data.flags,
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }

    /**
     * getK8SConfigFile
     * @param {*} data 
     * @param {*} params 
     */
    static async getK8SConfigFile(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.params.workspaceId, params);
        if(r.code){
            return r;
        }
        
        let k8s_node = await this.app.service('k8s_nodes').find({
            "query": {
                "workspaceId": data.params.workspaceId
            },
            "user": params.user
        });
        if(k8s_node.total == 0){
            let provisionTask = await this.app.service('tasks').find({
                "query": {
                    "target": "workspace",
                    "targetId": data.params.workspaceId,
                    "taskType": "CREATE-K8S-CLUSTER"
                },
                "user": params.user
            });

            if(provisionTask.total == 1){
                switch(provisionTask.data[0].status) {
                    case "IN_PROGRESS":
                        return {
                            "code": 200, 
                            "clusterStatus": provisionTask.data[0].status
                        };
                    case "PENDING":
                        return {
                            "code": 200, 
                            "clusterStatus": provisionTask.data[0].status
                        };
                    case "ERROR":
                        return {
                            "code": 200, 
                            "clusterStatus": provisionTask.data[0].status,
                            "logs": JSON.stringify(provisionTask.data[0].payload)
                        };
                    default:
                        throw new Unprocessable(new Error("The cluster deployment failed, and left the workspace in a unusable state."));
                }
            } else {
                throw new NotFound(new Error("Could not find k8s nodes for this workspace"));
            }
        } else {
            let masterNode = k8s_node.data.find(k => k.nodeType == "MASTER");
            let configFileContent = await MQTTController.queryRequestResponse(
                masterNode.k8s_host.ip,
                "get_k8s_config",
                masterNode
            );

            if(configFileContent.data.status == 200){
                return {
                    "code": 200,
                    "data": configFileContent.data.config
                };
            } else {
                return { "code": configFileContent.data.status };
            }
        }
    }

    /**
     * getK8SState
     * @param {*} workspaceId 
     */
    static async getK8SState(workspaceId, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._getWorkspaceMasterNodes(workspaceId, params);
        if(r.code){
            return r;
        }

        let response = await MQTTController.queryRequestResponse(r.data[0].k8s_host.ip, "get_k8s_state", r.data[0], 15000);
        if(response.data.status == 200){
            return {
                "code": 200,
                "data": response.data.state
            };
        } else {
            return { "code": response.data.status };
        }
    }
}

TaskRuntimeController.app = null;
TaskRuntimeController.mqttController = null;

module.exports = TaskRuntimeController;