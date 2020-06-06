const DBController = require('../db/index');
const NGinxController = require("../nginx/index");
const HTTPConfig = require('../nginx/default');
const TCPConfig = require('../nginx/tcp');

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
     * createDbRoutes
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
    static async createDbRoutes(workspaceId, domainId, dbService, dbApplication, workspaceK8SNodes, exposedPorts, serviceConfig) {
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
        return routeDbList;
    }

    /**
     * updateWorkspaceIngress
     * @param {*} ns 
     * @param {*} masterHost 
     * @param {*} masterNode 
     * @param {*} scope 
     */
    static async updateWorkspaceIngress(ns, masterHost, masterNode, scope) {
        // Update ingress rules on cluster
        let ingressResponse = await this.mqttController.queryRequestResponse(masterHost.ip, "update_cluster_ingress", {
            "host": masterHost, 
            "node": masterNode,
            "ns": ns,
            scope
        }, 60 * 1000 * 5);
        if(ingressResponse.data.status != 200){
            const error = new Error(ingressResponse.data.message);
            error.code = ingressResponse.data.status;
            throw error;
        }
        return ingressResponse.data;
    }

    /**
     * updateAndApplyLoadbalancerConfig
     * @param {*} workspaceId 
     * @param {*} ns 
     * @param {*} workspaceK8SNodes 
     */
    static async updateAndApplyLoadbalancerConfig(workspaceId, ns, workspaceK8SNodes) {
        if(!workspaceK8SNodes)
            workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
    
        let org = null;
        let account = null;
        let workspace = null;
        let services = null;
        let applications = null;
        let certificates = null;
        let allServices = null;
        let domainIds = null;
        let clusterNodeProfiles = [];
        let serviceProfiles = [];

        // Grab DB references
        org = await DBController.getOrgForWorkspace(workspaceId);
        account = await DBController.getAccountForOrg(org.id);
        workspace = await DBController.getWorkspace(workspaceId);
        services = await DBController.getServicesForWsRoutes(workspaceId, ns);
        applications = await DBController.getApplicationsForWsRoutes(workspaceId, ns);

        allServices = services.concat(applications);
        domainIds = allServices.filter(o => o.domainName).map(o => o.domainId);
        domainIds = [...new Set(domainIds)];
        if(domainIds.length > 0){
            certificates = await DBController.getCertificates(domainIds);
        }

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

        for(let i=0; i<allServices.length; i++){
            let exposeService = false;
            if(allServices[i].config){
                let config = JSON.parse(allServices[i].config);
                exposeService = config.exposeService;
            } else if(allServices[i].externalServiceName){
                exposeService = true;
            }

            if(exposeService){
                let profile = {
                    "instanceName": allServices[i].name,
                    "virtualPort": allServices[i].virtualPort,
                    "subdomain": allServices[i].subdomain,
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
                    if(certificates) {
                        let tCert =  certificates.find(o => o.domainId == allServices[i].domainId);
                        if(tCert){
                            profile.ssl = true;
                            profile.domain.cert = tCert;
                            profile.domain.subdomain = allServices[i].subdomain;
                        }
                    }
                }
                serviceProfiles.push(profile);
            }
        }
    
        await NGinxController.generateProxyConfigsForWorkspace(workspaceId, account.name, org.name, workspace.name, clusterNodeProfiles, serviceProfiles);
    }

    /**
     * deleteConfigServersForVirtualPorts
     * @param {*} workspaceK8SNodes 
     * @param {*} serviceRoutes 
     * @param {*} accountName 
     * @param {*} orgName 
     * @param {*} workspaceName 
     * @param {*} dbService 
     */
    static async deleteConfigServersForVirtualPorts(workspaceK8SNodes, serviceRoutes, accountName, orgName, workspaceName, dbService) {
        await NGinxController.deleteConfigServersForVirtualPorts(serviceRoutes, accountName, orgName, workspaceName, dbService, true);
        await this.updateAndApplyLoadbalancerConfig(
            dbService.workspaceId, 
            dbService.namespace, 
            workspaceK8SNodes
        );
    }

    /**
     * cleanupLoadbalancerAfterResourceDelete
     * @param {*} workspaceId 
     */
    static async cleanupLoadbalancerAfterResourceDelete(workspaceId) {
        let workspace = await DBController.getWorkspace(workspaceId);
        let org = await DBController.getOrgForWorkspace(workspaceId);
        let account = await DBController.getAccountForOrg(org.id);
     
        await NGinxController.cleanupLoadbalancerAfterResourceDelete(account.name, org.name, workspace.name);
    }

    /**
     * rollbackK8SResources
     * @param {*} host 
     * @param {*} node 
     * @param {*} ns 
     * @param {*} backupConfigs 
     * @param {*} newConfigs 
     */
    static async rollbackK8SResources(host, node, ns, backupConfigs, newConfigs) {
        await this.mqttController.queryRequestResponse(host.ip, "rollback_k8s_resources", {
            "node": node,
            "ns": ns,
            "backupConfigs": backupConfigs,
            "newConfigs": newConfigs
        }, 60 * 1000 * 3);
    }

    /**
     * requestUpdateUpstreamServersForCluster
     * @param {*} workspaceId 
     */
    static async requestUpdateUpstreamServersForCluster(workspaceId) {
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let activeNodes = workspaceK8SNodes.length > 1 ? workspaceK8SNodes.filter(n => n.nodeType == "WORKER") : workspaceK8SNodes;

        await NGinxController.updateUpstreamServersForCluster(activeNodes);
    }
}
module.exports = TaskNginxController;