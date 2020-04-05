const DBController = require('../db/index');
const OSController = require('../os/index');
const NGinxController = require("../nginx/index");
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class TaskNginxController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
    }

    /**
     * createNginxRoute
     * @param {*} workspaceId 
     * @param {*} ns 
     * @param {*} masterHost 
     * @param {*} masterNode 
     * @param {*} domainId 
     * @param {*} dbService 
     * @param {*} dbApplication 
     * @param {*} workspaceK8SNodes 
     * @param {*} exposedPorts 
     * @param {*} serviceConfig 
     */
    static async createNginxRoute(workspaceId, ns, masterHost, masterNode, domainId, dbService, dbApplication, workspaceK8SNodes, exposedPorts, serviceConfig) {
        if(!workspaceK8SNodes)
            workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let usedVirtualPorts = await DBController.getAllVirtualPorts();

        let routeDbList = [];
        for(let a=0; a<exposedPorts.length; a++){
            if(exposedPorts[a].type == "ClusterIP") {
                // Create route DB entry
                let virtualPort = null;
                while(virtualPort == null){
                    virtualPort = Math.floor(
                        Math.random() * (29999 - 20000) + 20000
                    );
                    if(usedVirtualPorts.indexOf(virtualPort) != -1){
                        virtualPort = null;
                    }
                }
                let routeDb = await DBController.createRoute(domainId, dbApplication ? dbApplication.id : null, dbService ? dbService.id : null, virtualPort, exposedPorts[a].to, serviceConfig.portConfig.find(o => o.port == exposedPorts[a].to).tcpStream, exposedPorts[a].type);
                routeDbList.push(routeDb);
            } else {
                // Create route DB entry
                let routeDb = await DBController.createRoute(domainId, dbApplication ? dbApplication.id : null, dbService ? dbService.id : null, exposedPorts[a].from, exposedPorts[a].to, serviceConfig.portConfig.find(o => o.port == exposedPorts[a].to).tcpStream, exposedPorts[a].type);
                routeDbList.push(routeDb);
            }
        }
        // Now generate the nginx and ingress configs
        await this.updateConfigAndIngress(workspaceId, ns, masterHost, masterNode, workspaceK8SNodes, serviceConfig, routeDbList);
    }

    /**
     * updateConfigAndIngress
     * @param {*} workspaceId 
     * @param {*} ns 
     * @param {*} masterHost 
     * @param {*} masterNode 
     * @param {*} workspaceK8SNodes 
     * @param {*} serviceConfig 
     * @param {*} routeDbList 
     */
    static async updateConfigAndIngress(workspaceId, ns, masterHost, masterNode, workspaceK8SNodes, serviceConfig, routeDbList) {
        if(!workspaceK8SNodes)
            workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        if(!routeDbList)
            routeDbList = await DBController.getWorkspaceRoutes(workspaceId);

        if(serviceConfig.portConfig.find(o => o.tcpStream == false)){
            // Update ingress rules on cluster
            let ingressResponse = await this.mqttController.queryRequestResponse(masterHost.ip, "update_cluster_ingress", {
                "host": masterHost, 
                "node": masterNode,
                "ns": ns
            }, 60 * 1000 * 1);
            if(ingressResponse.data.status != 200){
                /* ************* ROLLBACK ************ */
                for(let a=0; a<routeDbList.length; a++){
                    await DBController.removeRoute(routeDbList[a].id);
                }
                /* *********************************** */
                const error = new Error(ingressResponse.data.message);
                error.code = ingressResponse.data.status;
                throw error;
            }
        }
        
        let org = null;
        let account = null;
        let workspace = null;
        let services = null;
        let applications = null;
        try {
            // Grap DB references
            org = await DBController.getOrgForWorkspace(workspaceId);
            account = await DBController.getAccountForOrg(org.id);
            workspace = await DBController.getWorkspace(workspaceId);
            services = await DBController.getServicesForWsRoutes(workspaceId, ns);
            applications = await DBController.getApplicationsForWsRoutes(workspaceId, ns);
        } catch (error) {
            /* ************* ROLLBACK ************ */
            await DBController.removeRoute(routeDb.id);
            if(serviceConfig.portConfig.find(o => o.tcpStream == false)){
                await this.mqttController.queryRequestResponse(masterHost.ip, "update_cluster_ingress", {
                    "host": masterHost, 
                    "node": masterNode,
                    "serviceConfig": serviceConfig,
                    "ns": ns
                }, 60 * 1000 * 1);
            }
            /* *********************************** */ 
            throw error;
        }
        
        let allServices = services.concat(applications);

        let domainIds = allServices.filter(o => o.domainName).map(o => o.domainId);
        domainIds = [...new Set(domainIds)];
        
        let certificates = null;
        if(domainIds.length > 0){
            try{
                certificates = await DBController.getCertificates(domainIds);
            } catch (error) {
                /* ************* ROLLBACK ************ */
                for(let a=0; a<routeDbList.length; a++){
                    await DBController.removeRoute(routeDbList[a].id);
                }
                if(serviceConfig.portConfig.find(o => o.tcpStream == false)){
                    await this.mqttController.queryRequestResponse(masterHost.ip, "update_cluster_ingress", {
                        "host": masterHost, 
                        "node": masterNode,
                        "serviceConfig": serviceConfig,
                        "ns": ns
                    }, 60 * 1000 * 1);
                }
                /* *********************************** */ 
                throw error;
            }
        }
        
        let clusterNodeProfiles = [];
        if(workspaceK8SNodes.length == 1){
            clusterNodeProfiles.push({
                "ip": workspaceK8SNodes[0].ip,
                "port": 80
            });
        } else {
            clusterNodeProfiles = workspaceK8SNodes.filter(n => n.nodeType == "WORKER").map(o => {
                return {
                    "ip": o.ip,
                    "port": 80
                }
            });
        }
            
        let serviceProfiles = [];
        for(let i=0; i<allServices.length; i++){
            if(allServices[i].externalServiceName){
                let profile = {
                    "instanceName": allServices[i].name,
                    "virtualPort": allServices[i].virtualPort,
                    "port": allServices[i].port,
                    "ns": allServices[i].namespace,
                    "tcpStream": allServices[i].tcpStream,
                    "serviceType": allServices[i].serviceType,
                    "localIp": process.env.NGINX_HOST_IP
                };
                if(allServices[i].domainName) {
                    profile.domain = {
                        "name": allServices[i].domainName
                    }
                    if(certificates && certificates.find(o => o.domainId == allServices[i].domainId)) {
                        profile.ssl = true;
                    }
                }
                serviceProfiles.push(profile);
            }
        }
        
        let nginxHttpConfigBackup = null;
        let nginxTcpConfigBackup = null;
        try {
            nginxHttpConfigBackup = await NGinxController.generateHttpProxyConfig(workspaceId, account.name, org.name, workspace.name, clusterNodeProfiles, serviceProfiles);
            NGinxController.release();
            nginxTcpConfigBackup = await NGinxController.generateTcpProxyConfig(workspaceId, account.name, org.name, workspace.name, clusterNodeProfiles, serviceProfiles);
        } catch (error) {
            /* ************* ROLLBACK ************ */
            for(let a=0; a<routeDbList.length; a++){
                await DBController.removeRoute(routeDbList[a].id);
            }
            if(nginxHttpConfigBackup){
                await NGinxController.restoreHttpConfig(nginxHttpConfigBackup);
            }
            if(serviceConfig.portConfig.find(o => o.tcpStream == false)){
                await this.mqttController.queryRequestResponse(masterHost.ip, "update_cluster_ingress", {
                    "host": masterHost, 
                    "node": masterNode,
                    "serviceConfig": serviceConfig,
                    "ns": ns
                }, 60 * 1000 * 1);
            }
            /* *********************************** */ 
            throw error;
        }

        NGinxController.release();
    }
}
module.exports = TaskNginxController;