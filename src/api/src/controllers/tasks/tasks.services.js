// const shortid = require('shortid');
const MQTTController = require("../mqtt/index");
const DBController = require("../db/index");
const { Forbidden } = require('@feathersjs/errors');
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');

class TaskServiceController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;
        this.services = YAML.parse(fs.readFileSync("/usr/src/app/data/mc_services/available.yml", 'utf8'));
    }

    /**
     * getAvailableServices
     * @param {*} params 
     */
    static async getAvailableServices(params) {
        let services = YAML.parse(fs.readFileSync("/usr/src/app/data/mc_services/available.yml", 'utf8'));
        return { "code": 200, data: services }
    }

    /**
     * installService
     * @param {*} data 
     * @param {*} params 
     */
    static async installService(data, params) {



        console.log("SOCKET ID =>", data.socketId);



        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckPermissionsOrgAdmin_ws(data.workspaceId, params);
        if(r) {
            return r;
        }

        let s = await this.app.service("services").find({
            query: {
                "instanceName": data.name
            }
        }, params);
        if(s.total > 0){
            return { "code": 409 }
        }

        let targetService = this.services[data.service].versions.find(o => o.version == data.chartVersion);

        let taskInitData = {
            "type":"INFO",
            "step":"PROVISION",
            "socketId": data.socketId,
            "params":{
                "serviceLabel": data.service,
                "service": targetService,
                "ns": data.ns,
                "serviceParams": data.config,
                "instanceName": data.name,
                "exposeService": data.exposeService,
                "domainId": data.domainId,
                "volumeName": data.volumeName,
                "pvcSize": data.pvcSize
            },
            "ts":new Date().toISOString()
        };
        if(data.overwriteConfigFilePath) {
            let configFilePath = path.join(process.env.APP_TMP_DIR, data.overwriteConfigFilePath);
            taskInitData.params.overwriteConfigFile = fs.readFileSync(configFilePath, "utf8");
            fs.unlinkSync(configFilePath);
        }

        await this.parent.schedule(
            "PROVISION-SERVICE",
            "workspace",
            data.workspaceId,
            [taskInitData],
            params
        );

        return { "code": 200 }
    }

    /**
     * scheduleDeleteService
     * @param {*} workspaceId 
     * @param {*} flags 
     * @param {*} params 
     */
    static async scheduleDeleteService(workspaceId, data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(workspaceId, params);
        if(r.code){
            return r;
        }
       
        r = await this.parent._precheckPermissionsOrgAdmin_ws(workspaceId, params);
        if(r) {
            return r;
        }

        r = await this.parent._precheckServiceExistance(workspaceId, data.name, data.ns, params);
        if(r.code){
            return r;
        }

        let targetService = this.services[r.data[0].serviceName].versions.find(o => o.version == r.data[0].serviceVersion);
        
        await this.parent.schedule(
            "DEPROVISION-SERVICE",
            "workspace",
            workspaceId,
            [{
                "type":"INFO",
                "step":"DEPROVISION",
                "socketId": data.socketId,
                "params":{
                    "service": r.data[0],
                    "serviceConfig": targetService,
                    "workspaceId": workspaceId
                },
                "ts":new Date().toISOString()
            }],
            params
        );

        return { "code": 200 }
    }

    /**
     * getServiceBaseConfig
     * @param {*} workspaceId 
     * @param {*} params 
     */
    static async getServiceBaseConfig(workspaceId, data, params) {
        try {
            // console.log(data);
            let targetService = this.services[data.service].versions.find(o => o.version == data.chartVersion);
            let serviceConfigFile = path.join(global.appRoot, "..", "..", "..", "mc_services", "charts", `${targetService.chartFile.substring(0, targetService.chartFile.lastIndexOf("."))}.yaml`);

            return { "code": 200, "config": fs.readFileSync(serviceConfigFile, "utf8") };
        } catch (error) {
            console.log("ERROR =>", error);
            this.client.publish(`/mycloud/k8s/host/respond/api/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "get chart binary"
            }));
        }
    }

    /**
     * getWorkspacesServices
     * @param {*} workspaceId 
     */
    static async getWorkspacesServices(workspaceId, data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(workspaceId, params);
        if(r.code){
            return r;
        }

        r = await this.parent._precheckClusterAvailability(workspaceId, params);
        if(r.code){
            return r;
        }

        let services = await this.app.service("services").find({
            "query": {
                "workspaceId": workspaceId
            },
            "user": params.user
        });
       
        r = await this.parent._getWorkspaceMasterNodes(workspaceId, params);
        if(r.code){
            return r;
        }
       
        let org = null;
        let account = null;
        let workspace = null;
        let serviceProfiles = null;
        try {
            // Grap DB references
            org = await DBController.getOrgForWorkspace(workspaceId);
            account = await DBController.getAccountForOrg(org.id);
            workspace = await DBController.getWorkspace(workspaceId);
            serviceProfiles = await DBController.getServicesForWsRoutes(workspaceId, data.ns);
        } catch (error) {
            return { "code": 500 };
        }

        services = services.data.map(dbService => {
            let targetService = this.services[dbService.serviceName].versions.find(o => o.version == dbService.serviceVersion);
            dbService.routes = serviceProfiles.filter(o => o.id == dbService.id).map(service => {
                let routeData = {};
                if(service.externalServiceName && service.externalServiceName.length > 0){
                    routeData.lanUrl = {
                        ip: process.env.NGINX_HOST_IP,
                        externalPort: service.virtualPort,
                        internalPort: service.port
                    };
                    routeData.domainNameUrl = null;
                    if(service.domainName) {
                        if(service.tcpStream) {
                            routeData.domainNameUrl = {
                                url: `${account.name}-${org.name}-${workspace.name}-${service.namespace}-${service.name}-${service.virtualPort}.${service.domainName}`.toLowerCase(),
                                internalPort: service.port
                            };
                        } else {
                            routeData.domainNameUrl = {
                                url: `${account.name}-${org.name}-${workspace.name}-${service.namespace}-${service.name}.${service.domainName}`.toLowerCase(),
                                internalPort: service.port
                            };
                        }
                    }
                }
                return routeData;
            });
            dbService.internalDns = `${dbService.instanceName}.${dbService.namespace}.svc.cluster.local`;
            dbService.appVersion = targetService.appVersion;
            
            return dbService;
        });

        return { "code": 200, "data": services };
    }
}

TaskServiceController.app = null;
TaskServiceController.mqttController = null;

module.exports = TaskServiceController;