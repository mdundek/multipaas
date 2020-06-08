const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const YAML = require('yaml');
const { NotFound, Unprocessable } = require('@feathersjs/errors');
const Permissions = require('../../lib/permission_helper');

class TaskRuntimeController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;

        this._requestClusterDeploymentStatus();
    }

    /**
     * _requestClusterDeploymentStatus
     */
    static _requestClusterDeploymentStatus() {
        (async() => {
            let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes();
            let allK8SHosts = await DBController.getAllK8sHosts();
            let masterNodes = workspaceK8SNodes.filter(n => n.nodeType == "MASTER");

            for(let i=0; i<masterNodes.length; i++) {
                let masterHost = allK8SHosts.find(h => h.id == masterNodes[i].k8sHostId);

                MQTTController.client.publish(`/multipaas/k8s/host/query/${masterHost.ip}/trigger_deployment_status_events`, JSON.stringify({
                    node: masterNodes[i]
                }));
            }
        })();
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
     * addOrgUsers
     * @param {*} data 
     * @param {*} params 
     */
    static async addOrgUsers(data, params) {
        let transaction = null;
        try {
            let targetOrgs = await this.app.service('organizations').find({
                "query": {
                    "name": data.params.orgName,
                    "accountId": data.params.accountId
                },
                "user": params.user,
                "authentication": params.authentication,
                "paginate": false
            });
            if(targetOrgs.length != 1) {
                return {
                    "code": 404
                };
            }

            let org = targetOrgs[0];
            // Make sure current user has permissions to do this
            let isAccOwner = await Permissions.isAccountOwner({
                app: this.app,
                params
            }, org.accountId);
            if(!isAccOwner) {
                let isOrgAdmin = await Permissions.isOrgUserAdmin_ws({
                    app: this.app,
                    params
                }, org.id);

                if(!isOrgAdmin) {
                    return {
                        "code": 403
                    };
                }
            }

            // Make sure all users exist
            data.params.emails = [...new Set(data.params.emails)]; // Filter out duplicates
            let targetUsers = await this.app.service('users').find({
                "query": {
                    "email": {
                        $in: data.params.emails
                    }
                },
                "user": params.user,
                "authentication": params.authentication,
                "paginate": false
            });

            if(targetUsers.length != data.params.emails.length) {
                return {
                    "code": 405
                };
            }

            // Sort by existing vs new users for this org
        
            let accUsers = await this.app.service('acc-users').find({
                "user": params.user,
                "authentication": params.authentication,
                "paginate": false,
                "query": {
                    accountId: org.accountId
                }
            });
            let newAccTargetUsers = targetUsers.filter(u => {
                let existingU = accUsers.find(ou => ou.userId == u.id);
                return !existingU;
            });

            let orgUsers = await this.app.service('org-users').find({
                "user": params.user,
                "authentication": params.authentication,
                "paginate": false,
                "query": {
                    organizationId: org.id
                }
            });
            let newOrgTargetUsers = targetUsers.filter(u => {
                let existingU = orgUsers.find(ou => ou.userId == u.id);
                return !existingU;
            });
            let existingOrgTargetUsers = targetUsers.filter(u => {
                let existingU = orgUsers.find(ou => ou.userId == u.id);
                return existingU;
            });

            const sequelize = this.app.get('sequelizeClient');
            transaction = await sequelize.transaction();

            // Create new user acc bindings
            for(let i=0; i<newAccTargetUsers.length; i++) {
                await this.app.service('acc-users').create({
                    accountId: org.accountId, 
                    userId: newAccTargetUsers[i].id,
                    isAccountOwner: false
                }, {
                    _internalRequest: true,
                    sequelize: { transaction }
                });
            }

            // Create new user org bindings
            for(let i=0; i<newOrgTargetUsers.length; i++) {
                await this.app.service('org-users').create({
                    organizationId: org.id, 
                    userId: newOrgTargetUsers[i].id,
                    permissions: data.params.permissions.join(',')
                }, {
                    _internalRequest: true,
                    sequelize: { transaction }
                });
            }

            // Update new user org bindings
            for(let i=0; i<existingOrgTargetUsers.length; i++) {
                let existingOrgAcc = orgUsers.find(o => o.userId == existingOrgTargetUsers[i].id);
                await this.app.service('org-users').update(existingOrgAcc.id, {
                    organizationId: org.id, 
                    userId: existingOrgTargetUsers[i].id,
                    permissions: data.params.permissions.join(',')
                }, {
                    _internalRequest: true,
                    sequelize: { transaction }
                });
            }

            await transaction.commit();
            return {
                code: 200
            };
        } catch (error) {
            console.error(error);
            if (transaction) {
                await transaction.rollback();
            }
            return { "code": 500 };
        }
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
            "user": params.user,
            "authentication": params.authentication
        });
        if(k8s_node.total == 0){
            let provisionTask = await this.app.service('tasks').find({
                "query": {
                    "target": "workspace",
                    "targetId": data.params.workspaceId,
                    "taskType": "CREATE-K8S-CLUSTER"
                },
                "user": params.user,
                "authentication": params.authentication
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
                {
                    "node": masterNode
                }
            );

            // Remove admin certificate from file so that we can inject the target user on the CLI side for RBAC authentication
            let buff = Buffer.from(configFileContent.data.config, 'base64');
            let kubecfgText = buff.toString('ascii');
            let cfgFile = YAML.parse(kubecfgText);
            cfgFile.users[0].user = {};
            
            // Now return file to cli 
            if(configFileContent.data.status == 200){
                return {
                    "code": 200,
                    "data": Buffer.from(YAML.stringify(cfgFile)).toString('base64')
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

        let response = await MQTTController.queryRequestResponse(r.data[0].k8s_host.ip, "get_k8s_state", {
            "node": r.data[0]
        }, 15000);
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