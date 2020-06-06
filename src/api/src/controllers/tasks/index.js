const shortid = require('shortid');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const OSController = require("../os/index");
// const { NotFound, Unprocessable, Forbidden } = require('@feathersjs/errors');
// const Permissions = require('../../lib/permission_helper');
const Permissions = require('../../lib/permission_helper');
const TaskRuntimeController = require("./tasks.runtime");
const TaskVolumeController = require("./tasks.volume");
const TaskServiceController = require("./tasks.services");
const TaskApplicationsController = require("./tasks.applications");
const TaskDomainsController = require("./tasks.domains");
const TaskCertificatesController = require("./tasks.certificates");
const TaskNamespaceController = require("./tasks.ns");
const TaskPvcController = require("./tasks.pvc");
const TaskKeycloakController = require("./tasks.keycloak");

class TaskController {

    /**
     * init
     */
    static init(app, mqttController) {
        this.app = app;
        this.mqttController = mqttController;

        TaskRuntimeController.init(this, app, mqttController);
        TaskVolumeController.init(this, app, mqttController);
        TaskServiceController.init(this, app, mqttController);
        TaskApplicationsController.init(this, app, mqttController);
        TaskDomainsController.init(this, app, mqttController);
        TaskCertificatesController.init(this, app, mqttController);
        TaskNamespaceController.init(this, app, mqttController);
        TaskPvcController.init(this, app, mqttController);
        TaskKeycloakController.init(this, app, mqttController);
        
        this.services = YAML.parse(fs.readFileSync(path.join(process.env.MP_SERVICES_DIR, "available.yml"), 'utf8'));

        // (async() => {
        //     try {
        //         await OSController.hostFeedbackSshExec("172.16.42.1", `ls -l`, (err, out) => {
        //             console.log("ERR =>", err);
        //             console.log("OUT =>", out);
        //         });
        //     } catch (error) {
        //         console.log(error);
        //     }
        // })();
    }

    /**
     * schedule
     * @param {*} taskType 
     * @param {*} target 
     * @param {*} targetId 
     * @param {*} payload 
     */
    static async schedule(taskType, target, targetId, payload, params) {
        let taskId = shortid.generate();
        let dbEntry = await this.app.service("tasks").create({
            taskId: taskId,
            taskType: taskType,
            target: target,
            targetId: targetId,
            status: "PENDING",
            payload: JSON.stringify(payload ? payload : [])
        }, params);
        this.mqttController.notifyNewTask(dbEntry.id);
    }

    /**
     * _precheckPermissionsOrgAdmin_ws
     * @param {*} workspaceId 
     * @param {*} arams 
     */
    static async _precheckPermissionsOrgAdmin_ws(workspaceId, params) {
        // Make sure user has the right permissions
        let context = {
            params: params,
            app: this.app
        }
        // Is user is sysadmin, return it all
        if((await Permissions.isSysAdmin(context)) || context.params._internalRequest){
            delete params._internalRequest;
        } else if(await Permissions.isResourceAccountOwner(context, null, workspaceId)){
            if(!(await Permissions.isAccountOwnerAllowed_ws(context, workspaceId))){
                return { "code": 403 }
            }
        } else {
            if(!(await Permissions.isOrgUserAllowed_ws(context, workspaceId))){
                return { "code": 403 }
            }
        }
    }

    /**
     * _precheckPermissionsOrgAdmin
     * @param {*} orgId 
     * @param {*} params 
     */
    static async _precheckPermissionsOrgAdmin(orgId, params) {
        // Make sure user has the right permissions
        let context = {
            params: params,
            app: this.app
        }
        // Is user is sysadmin, return it all
        if((await Permissions.isSysAdmin(context)) || context.params._internalRequest){
            delete params._internalRequest;
        } else if(!(await Permissions.isResourceAccountOwner(context, orgId, null))){
            return { "code": 403 }
        }
        try {
            await Permissions.userBelongsToAccount_org(context, orgId);
        } catch (error) {
            return { "code": 403 }
        }
    }

    /**
     * _precheckExistanceByNameForWs
     * @param {*} workspaceId 
     * @param {*} model 
     * @param {*} name 
     * @param {*} params 
     */
    static async _precheckExistanceByNameForWs(workspaceId, model, name, params) {
        // Make sure the volume does exist
        let response = await this.app.service(model).find({
            "query": {
                "workspaceId": workspaceId,
                "name": name
            },
            "user": params.user,
            "authentication": params.authentication
        });

        if(response.total == 0) {
            return { "code": 404 }
        }
        return response;
    }

    /**
     * _precheckNonExistanceByNameForWs
     * @param {*} workspaceId 
     * @param {*} model 
     * @param {*} name 
     * @param {*} params 
     */
    static async _precheckNonExistanceByNameForWs(workspaceId, model, name, params) {
        // Make sure the volume does exist
        let response = await this.app.service(model).find({
            "query": {
                "workspaceId": workspaceId,
                "name": name
            },
            "user": params.user,
            "authentication": params.authentication
        });

        if(response.total != 0) {
            return { "code": 409 }
        }
        return response;
    }

    /**
     * _precheckExistanceByNameForOrg
     * @param {*} organizationId 
     * @param {*} model 
     * @param {*} name 
     * @param {*} params 
     */
    static async _precheckExistanceByNameForOrg(organizationId, model, name, params) {
        // Make sure the volume does exist
        let response = await this.app.service(model).find({
            "query": {
                "organizationId": organizationId,
                "name": name
            },
            "user": params.user,
            "authentication": params.authentication
        });

        if(response.total == 0) {
            return { "code": 404 }
        }
        return response;
    }

    /**
     * _precheckNonExistanceByNameForOrg
     * @param {*} organizationId 
     * @param {*} model 
     * @param {*} name 
     * @param {*} params 
     */
    static async _precheckNonExistanceByNameForOrg(organizationId, model, name, params) {
        // Make sure the volume does exist
        let response = await this.app.service(model).find({
            "query": {
                "organizationId": organizationId,
                "name": name
            },
            "user": params.user,
            "authentication": params.authentication
        });

        if(response.total != 0) {
            return { "code": 409 }
        }
        return response;
    }

    /**
     * _precheckNonExistanceByName
     * @param {*} model 
     * @param {*} name 
     */
    static async _precheckNonExistanceByName(model, name) {
        // Make sure the volume does exist
        let response = await this.app.service(model).find({
            "query": {
                "name": name
            },
            _internalRequest: true
        });

        if(response.total != 0) {
            return { "code": 409 }
        }
        return response;
    }

    /**
     * _precheckWorkspaceReadyNotBussy
     * @param {*} workspaceId 
     * @param {*} params 
     */
    static async _precheckWorkspaceReadyNotBussy(workspaceId, params) {
        // Make sure the workspace exists
        let ws = await this.app.service("workspaces").get(workspaceId, params);
        if(!ws){
            return { "code": 404 }
        }

        // Make sure there is no pending update request already
        let dbEntry = await this.app.service("tasks").find({
            "query": {
                target: "workspace",
                targetId: workspaceId,
                status: {
                    $in: [ "PENDING","IN_PROGRESS" ]
                }
            },
            "user": params.user,
            "authentication": params.authentication
        });
        if(dbEntry.total != 0){
            return { "code": 425 }
        }
        return ws;
    }

    /**
     * _precheckClusterAvailability
     * @param {*} workspaceId 
     * @param {*} params 
     */
    static async _precheckClusterAvailability(workspaceId, params) {
        // Make sure the workspace exists
        let ws = await this.app.service("workspaces").get(workspaceId, params);
        if(!ws){
            return { "code": 404 }
        }

        // Make sure there is no pending update request already
        let dbEntry = await this.app.service("tasks").find({
            "query": {
                target: "workspace",
                taskType: "CREATE-K8S-CLUSTER",
                targetId: workspaceId,
                status: {
                    $in: [ "PENDING","IN_PROGRESS" ]
                }
            },
            "user": params.user,
            "authentication": params.authentication
        });
        if(dbEntry.total != 0){
            return { "code": 425 }
        }
        return ws;
    }

    /**
     * _precheckVolumeExistance
     * @param {*} workspaceId 
     * @param {*} volumeName 
     * @param {*} params 
     */
    static async _precheckVolumeExistance(workspaceId, volumeName, params) {
        // Make sure the volume does exist
        let volumes = await this.app.service("volumes").find({
            "query": {
                "workspaceId": workspaceId,
                "name": volumeName
            },
            "user": params.user,
            "authentication": params.authentication
        });

        if(volumes.total == 0) {
            return { "code": 404 }
        }
        return volumes;
    }

    /**
     * _precheckSubdomainOverlap
     * @param {*} domainId 
     * @param {*} portDomainMappings 
     * @param {*} params 
     */
    static async _precheckSubdomainOverlap(domainId, portDomainMappings, target, targetId, params) {
        // Make sure the volume does exist
        let domainRoutes = await this.app.service("routes").find({
            "paginate": false,
            "query": {
                "domainId": domainId
            },
            "user": params.user,
            "authentication": params.authentication
        });
        
        let searchRoutes = domainRoutes.filter(route => {
            if(target == "app") {
                return route.applicationId == null || route.applicationId != targetId;
            } else {
                return route.serviceId == null || route.serviceId != targetId;
            }
        });
        let subdomainDoubles = portDomainMappings
            .filter(domainMap => domainMap.subdomain && domainMap.subdomain.length > 0)
            .filter(domainMap => searchRoutes.find(route => route.subdomain == domainMap.subdomain));
       
        if(subdomainDoubles.length > 0) {
            return { "code": 409, "doubles": subdomainDoubles };
        }

        let domainDoubles = portDomainMappings
            .filter(domainMap => !domainMap.subdomain || domainMap.subdomain.length == 0)
            .filter(domainMap => searchRoutes.find(route => route.subdomain == null || route.subdomain.length == 0));

        if(domainDoubles.length > 0) {
            return { "code": 409, "doubles": domainDoubles };
        }

        return {};
    }

    /**
     * _precheckServiceExistance
     * @param {*} workspaceId 
     * @param {*} volumeName 
     * @param {*} params 
     */
    static async _precheckServiceExistance(workspaceId, serviceName, ns, params) {
        // Make sure the volume does exist
        let service = await this.app.service("services").find({
            "query": {
                "workspaceId": workspaceId,
                "instanceName": serviceName,
                "namespace": ns
            },
            "user": params.user,
            "authentication": params.authentication
        });

        if(service.total == 0) {
            return { "code": 404 }
        }
        return service;
    }

    /**
     * _precheckVolumeNonExistance
     * @param {*} workspaceId 
     * @param {*} volumeName 
     * @param {*} params 
     */
    static async _precheckVolumeNonExistance(workspaceId, volumeName, params) {
        // Make sure the volume does exist
        let volumes = await this.app.service("volumes").find({
            "query": {
                "workspaceId": workspaceId,
                "name": volumeName
            },
            "user": params.user,
            "authentication": params.authentication
        });

        if(volumes.total != 0) {
            return { "code": 409 }
        }
        return volumes;
    }

    /**
     * _getWorkspaceMasterNodes
     * @param {*} workspaceId 
     * @param {*} params 
     */
    static async _getWorkspaceMasterNodes(workspaceId, params) {
        // Get cluster master node
        let masterNodeResult = await this.app.service("k8s_nodes").find({
            "query": {
                nodeType: "MASTER",
                workspaceId: workspaceId
            },
            "user": params.user,
            "authentication": params.authentication
        });
        if(masterNodeResult.total == 0){
            return {
                "code": 500,
                "message": "The workspace cluster could not be found."
            }
        }
        return masterNodeResult;
    }

    /**
     * getTaskList
     * @param {*} workspaceId 
     */
    static async getTaskList(workspaceId, params) {
        let ws = await this.app.service("workspaces").get(workspaceId, params);
        if(!ws){
            return { "code": 404 }
        }

        let provisionTask = await this.app.service('tasks').find({
            "query": {
                "target": "workspace",
                "targetId": workspaceId,
                $sort: {
                    createdAt: -1
                },
                $limit: 10
            },
            "user": params.user,
            "authentication": params.authentication
        });

        provisionTask.data = provisionTask.data.reverse();
        
        for(let i=0; i<provisionTask.data.length; i++){
            provisionTask.data[i].payload = JSON.parse(provisionTask.data[i].payload);

            provisionTask.data[i].createdAt = moment(provisionTask.data[i].createdAt).format("Do MMM YY, hh:mm")

            switch(provisionTask.data[i].status) {
                case "IN_PROGRESS":
                    provisionTask.data[i].payload = provisionTask.data[i].payload.filter((l, y) => y == 0);
                    break;
                case "PENDING":
                    provisionTask.data[i].payload = provisionTask.data[i].payload.filter((l, y) => y == 0);
                    break;
                case "DONE":
                    provisionTask.data[i].payload = provisionTask.data[i].payload.filter((l, y) => y == 0);
                    break;
                case "ERROR":
                    provisionTask.data[i].payload = provisionTask.data[i].payload.filter((l, y) => y == 0 || l.type == "ERROR");
                    break;
            }
            
            if(provisionTask.data[i].payload.length > 0){
                if(provisionTask.data[i].payload[0].params) {
                    provisionTask.data[i].payload[0] = provisionTask.data[i].payload[0].params;
                } else if(provisionTask.data[i].payload[0].flags) {
                    provisionTask.data[i].payload[0] = provisionTask.data[i].payload[0].flags;
                } else {
                    provisionTask.data[i].payload[0] = null;
                }
            } else {
                provisionTask.data[i].payload.push(null);
            }
            
            let data;
            switch(provisionTask.data[i].taskType) {
                case "UNBIND-VOLUME":
                    provisionTask.data[i].taskType = "Unbind volume";
                    data = provisionTask.data[i].payload[0];
                    provisionTask.data[i].details = provisionTask.data[i].payload[0] ? `Volume name: ${data.volume.name}, Size: ${data.volume.size / 1024}Gi, Unbind from: ${data.unbindFrom}` : "";
                    break;
                case "BIND-VOLUME":
                    provisionTask.data[i].taskType = "Bind volume";
                    data = provisionTask.data[i].payload[0];
                    provisionTask.data[i].details = provisionTask.data[i].payload[0] ? `Volume name: ${data.volume.name}, Size: ${data.volume.size / 1024}Gi, Bind to: ${data.bindTo}` : "";
                    break;
                case "CREATE-K8S-CLUSTER":
                    provisionTask.data[i].taskType = "Initiate K8S cluster";
                    provisionTask.data[i].details = provisionTask.data[i].payload[0] ? `` : "";
                    break;
                case "UPDATE-K8S-CLUSTER":
                    provisionTask.data[i].taskType = "Update K8S cluster config";
                    data = provisionTask.data[i].payload[0];
                    provisionTask.data[i].details = provisionTask.data[i].payload[0] ? (data.scale ? `Scaling cluster to ${data.scale} instance(s)` : ``) : "";
                    break;
                case "DEPROVISION-VOLUME":
                    provisionTask.data[i].taskType = "Deprovisionning volume";
                    data = provisionTask.data[i].payload[0];
                    provisionTask.data[i].details = provisionTask.data[i].payload[0] ? `Volume name: ${data.volumeName}, Type: ${data.type}, Type: ${data.type}` : "";
                    break;
                case "PROVISION-VOLUME":
                    provisionTask.data[i].taskType = "Provisionning volume";
                    data = provisionTask.data[i].payload[0];
                    provisionTask.data[i].details = provisionTask.data[i].payload[0] ? `Volume name: ${data.name}, Size: ${data.size / 1024}Gi, Type: ${data.type}` : "";
                    break;
                case "PROVISION-SERVICE":
                    provisionTask.data[i].taskType = "Provisionning service";
                    data = provisionTask.data[i].payload[0];
                    provisionTask.data[i].details = provisionTask.data[i].payload[0] ? `Service name: ${data.serviceLabel} (${data.service.appVersion})` : "";
                    break;
                case "DEPROVISION-SERVICE":
                    provisionTask.data[i].taskType = "Derovisionning service";
                    data = provisionTask.data[i].payload[0];
                    let targetService = this.services[data.service.serviceName].versions.find(o => o.version == data.service.serviceVersion);
                    provisionTask.data[i].details = provisionTask.data[i].payload[0] ? `Service name: ${data.service.serviceName} (${targetService.appVersion})` : "";
                    break;
                case "DEPLOY-IMAGE":
                    provisionTask.data[i].taskType = "Build & push image to registry";
                    data = provisionTask.data[i].payload[0];
                    console.log(JSON.stringify(data, null, 4));
                    provisionTask.data[i].details = "N/A";
                    break;
                case "DELETE-IMAGE":
                    provisionTask.data[i].taskType = "Delete image from registry";
                    data = provisionTask.data[i].payload[0];
                    console.log(JSON.stringify(data, null, 4));
                    provisionTask.data[i].details = "N/A";
                    break;
                default:
                    console.error("Unsupported task type: " + provisionTask.data[i].taskType);
                    console.log(JSON.stringify(provisionTask.data[i], null, 4));
            }
        }

        return {
            "code": 200, 
            "data": provisionTask.data
        };    
    }

    /**
     * scheduleOrgDelete
     * @param {*} orgName 
     * @param {*} accountId 
     * @param {*} params 
     */
    static async scheduleOrgDelete(orgName, accountId, params) {
        let targetOrg = await this.app.service('organizations').find({
            "query": {
                "name": orgName,
                "accountId": accountId
            },
            "user": params.user,
            "authentication": params.authentication
        });
        
        if(targetOrg.total == 1){
            let error = await this._precheckPermissionsOrgAdmin(targetOrg.data[0].id, params);
            if(error) {
                return error;
            }
            try{
                let orgWorkspaces = await this.app.service('workspaces').find({
                    "query": {
                        "organizationId": targetOrg.data[0].id
                    },
                    "user": params.user,
                    "authentication": params.authentication
                });
                // Schedule workspace resource cleanup
                for(let i=0; i<orgWorkspaces.data.length; i++) {
                    await this.scheduleWorkspaceDelete(orgWorkspaces.data[i].name, targetOrg.data[0].id, params);
                }

                await this.schedule(
                    "DEPROVISION-ORGANIZATION",
                    "organization",
                    targetOrg.data[0].id,
                    [{
                        "type": "INFO",
                        "step": "DEPROVISION-ORGANIZATION",
                        "ts": new Date().toISOString()
                    }],
                    params
                );
            } catch(err){
                console.log(err);
                return {"code": err.code};
            }
            return {"code": 200, "id": targetOrg.data[0].id};
        } else {
            return {"code": 404};
        }
    }

    /**
     * scheduleWorkspaceDelete
     * @param {*} workspaceName 
     * @param {*} orgId 
     * @param {*} params 
     */
    static async scheduleWorkspaceDelete(workspaceName, orgId, params) {
        let targetWs = await this.app.service('workspaces').find({
            "query": {
                "name": workspaceName,
                "organizationId": orgId
            },
            "user": params.user,
            "authentication": params.authentication
        });

        if(targetWs.total == 1){
            let error = await this._precheckPermissionsOrgAdmin_ws(targetWs.data[0].id, params);
            if(error) {
                return error;
            }

            // Collect all workspace k8s nodes to deprovision
            let k8sNodes = await this.app.service('k8s_nodes').find({
                "query": {
                    "workspaceId": targetWs.data[0].id
                },
                "user": params.user,
                "authentication": params.authentication
            });
            // Collect all volumes to delete
            let wsVolumes = await this.app.service('volumes').find({
                "query": {
                    "workspaceId": targetWs.data[0].id,
                    "type": "gluster"
                },
                "user": params.user,
                "authentication": params.authentication
            });

            let cleanupPayload = {
                k8sNodes: k8sNodes.data,
                glusterVolumeIds: []
            };
            for(let y=0; y<wsVolumes.data.length; y++){
                cleanupPayload.glusterVolumeIds.push(wsVolumes.data[y].id);
            }

            await this.schedule(
                "DEPROVISION-WORKSPACE-RESOURCES",
                "workspace",
                targetWs.data[0].id,
                [{
                    "type": "INFO",
                    "step": "DEPROVISION-WORKSPACE",
                    "params": cleanupPayload,
                    "ts": new Date().toISOString()
                }],
                params
            );
            return {"code": 200, "id": targetWs.data[0].id};

        } else {
            return {"code": 404};
        }
    }







    /**
     * addGitlabRunner
     * @param {*} data 
     * @param {*} params 
     */
    static async addGitlabRunner(data, params) {
        let r = await this._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }
        
        r = await this._getWorkspaceMasterNodes(data.workspaceId, params);
        if(r.code){
            return r;
        }
        let k8s_nodes = await this.app.service('k8s_nodes').find({
            "query": {
                "workspaceId": data.workspaceId
            },
            "user": params.user,
            "authentication": params.authentication
        });
        let masterNode = k8s_nodes.data.find(k => k.nodeType == "MASTER");
        let responseAddRunner = await MQTTController.queryRequestResponse(masterNode.k8s_host.ip, "add_gitlab_runner", {
            "runnerData": data,
            "node": masterNode
        }, 15000);
        if(responseAddRunner.data.status != 200){
            return { "code": 500 };
        }
        return { "code": 200 }
    }

}

TaskController.app = null;
TaskController.mqttController = null;

module.exports = TaskController;