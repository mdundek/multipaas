// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const EventController = require("../events/index");
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
    static async deleteOrgRegistryImage(workspaceId, data, params) {
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
                "params": data,
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

        // r = await this.parent._precheckNonExistanceByNameForWs(data.workspaceId, "applications", data.name, params);
        // if(r.code){
        //     return r;
        // }

        // r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        // if(r) {
        //     return r;
        // }

        await this.parent.schedule(
            "PROVISION-APPLICATION",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"PROVISION",
                "socketId": data.socketId,
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
    static async scheduleScaleApplication(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        // r = await this.parent._precheckNonExistanceByNameForWs(data.workspaceId, "applications", data.name, params);
        // if(r.code){
        //     return r;
        // }

        // r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        // if(r) {
        //     return r;
        // }

        await this.parent.schedule(
            "SCALE-APPLICATION",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"SCALE",
                "socketId": data.socketId,
                "params": data,
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }

    /**
     * scheduleAddApplicationVersion
     * @param {*} data 
     * @param {*} params 
     */
    static async scheduleAddApplicationVersion(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        
        // r = await this.parent._precheckNonExistanceByNameForWs(data.workspaceId, "applications", data.name, params);
        // if(r.code){
        //     return r;
        // }

        // r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        // if(r) {
        //     return r;
        // }

        await this.parent.schedule(
            "PROVISION-APPLICATION-VERSION",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"PROVISION",
                "socketId": data.socketId,
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
    static async scheduleReplaceApplicationVersion(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        // r = await this.parent._precheckNonExistanceByNameForWs(data.workspaceId, "applications", data.name, params);
        // if(r.code){
        //     return r;
        // }

        // r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        // if(r) {
        //     return r;
        // }

        await this.parent.schedule(
            "REPLACE-APPLICATION-VERSION",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"PROVISION",
                "socketId": data.socketId,
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
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"DEPROVISION",
                "socketId": data.socketId,
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
    static async appCanarySplit(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }
       
        await this.parent.schedule(
            "CANARY-SPLIT_APPLICATION",
            "workspace",
            data.workspaceId,
            [{
                "type":"INFO",
                "step":"CANARY",
                "socketId": data.socketId,
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
    static async listApplications(data, params) {      
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckClusterAvailability(data.workspaceId, params);
        if(r.code){
            return r;
        }

        let applications = await this.app.service("applications").find({
            "query": {
                "workspaceId": data.workspaceId
            },
            "user": params.user,
            "authentication": params.authentication
        });
       
        r = await this.parent._getWorkspaceMasterNodes(data.workspaceId, params);
        if(r.code){
            return r;
        }
       
        let org = null;
        let account = null;
        let workspace = null;
        let applicationRoutes = null;
        let masterNode = null;
        try {
            // Grap DB references
            org = await DBController.getOrgForWorkspace(data.workspaceId);
            account = await DBController.getAccountForOrg(org.id);
            workspace = await DBController.getWorkspace(data.workspaceId);
            applicationRoutes = await DBController.getApplicationsForWsRoutes(data.workspaceId, data.ns);
            // applicationVersions = await DBController.getApplicationVersionsForWs(data.workspaceId, data.ns);

            let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(data.workspaceId);
            masterNode = workspaceK8SNodes.find(n => n.nodeType == "MASTER");

        } catch (error) {
            console.log(error);
            return { "code": 500 };
        }

        let deploymentData = EventController.deploymentStatus[masterNode.hostname];

        let domainIds = [];
        let appData = applications.data.map(dbApplication => {
            let _dbApp = JSON.parse(JSON.stringify(dbApplication));
            let matchingRoutes = applicationRoutes.filter(o => o.applicationId == dbApplication.id).map(application => {
                if(application.domainId != null && domainIds.indexOf(application.domainId) == -1) {
                    domainIds.push(application.domainId);
                }
                let routeData = {
                    tcpStream: application.tcpStream
                };                
                if(dbApplication.application_versions[0].externalServiceName && dbApplication.application_versions[0].externalServiceName.length > 0){
                    routeData.lanUrl = {
                        ip: process.env.NGINX_HOST_IP,
                        externalPort: application.virtualPort,
                        internalPort: application.port
                    };
                    routeData.domainNameUrl = null;
                    
                    if(application.domainName){
                        if(application.tcpStream && process.env.ENABLE_NGINX_STREAM_DOMAIN_NAME == "true") {
                            routeData.domainNameUrl = {
                                domainId: application.domainId,
                                url: `${application.subdomain ? application.subdomain + "." : ""}${application.domainName}`.toLowerCase(),
                                internalPort: application.port
                            };
                        } else if(!application.tcpStream) {
                            routeData.domainNameUrl = {
                                domainId: application.domainId,
                                url: `${application.subdomain ? application.subdomain + "." : ""}${application.domainName}`.toLowerCase(),
                                internalPort: application.port
                            };
                        }
                    }
                  
                }
                return routeData;
            });
            
            _dbApp.routes = matchingRoutes;
            _dbApp.versions = dbApplication.application_versions.map(v => {
                let _v = JSON.parse(JSON.stringify(v));
                if(deploymentData){
                    _v.status = deploymentData.find(o => o.deployment == _v.externalServiceName && o.ns == dbApplication.namespace);
                }
                _v.dns = `${_v.externalServiceName}.${dbApplication.namespace}.svc.cluster.local`;
                _v.weight = _v.weight;
                return _v;
            });
            return _dbApp;
        });

        if(domainIds.length > 0) {
            let certificates = await DBController.getCertificateForDomains(domainIds);
            appData = appData.map(app => {
                app.routes = app.routes.map(route => {
                    if(route.domainNameUrl && route.domainNameUrl.domainId != null) {
                        let cert = certificates.find(c => c.domainId == route.domainNameUrl.domainId );
                        if(cert) {
                            route.domainNameUrl.ssl = true;
                        }
                    }
                    return route;
                });
                return app;
            });
        }
        return { "code": 200, "data": appData };
    }

}

TaskApplicationsController.app = null;
TaskApplicationsController.mqttController = null;

module.exports = TaskApplicationsController;