const DBController = require('../db/index');
const OSController = require('../os/index');
const TaskVolumeController = require('./tasks.volume');
const TaskRuntimeController = require('./tasks.runtime');
const TaskNginxController = require('./tasks.nginx');
const YAML = require('yaml');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class TaskServicesController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
    }

    /**
     * provisionServiceToTenantWorkspace
     * @param {*} socketId 
     * @param {*} workspaceId 
     * @param {*} ns 
     * @param {*} serviceLabel 
     * @param {*} service 
     * @param {*} overwriteConfigFileContent 
     * @param {*} serviceParams 
     * @param {*} serviceInstanceName 
     * @param {*} exposeService 
     * @param {*} volumeName 
     * @param {*} pvcSize 
     * @param {*} domainId 
     */
    static async provisionServiceToTenantWorkspace(socketId, workspaceId, ns, serviceLabel, service, overwriteConfigFileContent, serviceParams, serviceInstanceName, exposeService, volumeName, pvcSize, domainId) {
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
      
        let masterNode = workspaceK8SNodes.find(n => n.nodeType == "MASTER");
        let masterHost = await DBController.getK8sHost(masterNode.k8sHostId);

        let volume = null;
        let servicePv = null;
        let servicePvc = null;
        let size = null;
        let hasDedicatedVolume = false;
        let pvName = null;
        let pvcName = null;
        
        // If service requires a persistet volume
        if(service.provision_volume) {
            size = pvcSize;
            volume = await DBController.getVolumeByName(workspaceId, volumeName);

            let hash = null;
            while(hash == null){
                hash = shortid.generate();
                if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                    hash = null;
                }
            }
            hash = hash.toLowerCase();

            // Create PV 
            this.mqttController.logEvent(socketId, "info", "Deploying persisted volume");
            pvName = `srv-${serviceInstanceName}-pv`;
            let responsePv = await this.mqttController.queryRequestResponse(masterHost.ip, "deploy_k8s_persistant_volume", {
                "node": masterNode,
                "host": masterHost,
                "pvName": pvName,
                "ns": ns,
                "subFolderName": `srv-${serviceInstanceName}`,
                "volume": volume,
                "size": size,
                "hostnames": workspaceK8SNodes.map(o =>o.hostname),
                "workspaceId": workspaceId
            }, 60 * 1000 * 15);
            if(responsePv.data.status != 200){
                this.mqttController.logEvent(socketId, "error", "Error while creating the persisted volume, rollback");
                pvName = null;
                const error = new Error(responsePv.data.message);
                error.code = responsePv.data.status;

                throw error;
            }

            // Now PVC
            this.mqttController.logEvent(socketId, "info", "Deploying persisted volume claim");
            pvcName = `srv-${serviceInstanceName}-pvc`;
            let responsePvc = await this.mqttController.queryRequestResponse(masterHost.ip, "deploy_k8s_persistant_volume_claim", {
                "pvName": pvName,
                "pvcName": pvcName,
                "ns": ns,
                "size": `${size}Mi`,
                "node": masterNode,
                "workspaceId": workspaceId
            }, 60 * 1000 * 5);
            
            if(responsePvc.data.status != 200){
                this.mqttController.logEvent(socketId, "error", "Error while creating the persisted volume claim, rollback");
                pvcName = null;
                const error = new Error(responsePvc.data.message);
                error.code = responsePvc.data.status;

                throw error;
            }
            
            // Get K8S PV & PVC
            this.mqttController.logEvent(socketId, "info", "Collecting cluster resources");
            let pvsResponse = await this.mqttController.queryRequestResponse(masterHost.ip, "get_k8s_resources", {
                "targets": ["pv", "pvc"],
                "ns": ns,
                "node": masterNode
            }, 15000);
            if(pvsResponse.data.status == 200){
                servicePv = pvsResponse.data.output.pv.find(o => o.NAME == pvName);
                servicePvc = pvsResponse.data.output.pvc.find(o => o.NAME == pvcName);
            } else {
                this.mqttController.logEvent(socketId, "error", "Error while collecting cluster resources, rollback");
                /* ************* ROLLBACK ************ */
                await TaskVolumeController.deprovisionPVC({
                    "node": masterNode,
                    "host": masterHost
                }, ns, pvcName);
                await TaskVolumeController.deprovisionPV({
                    "node": masterNode,
                    "host": masterHost
                }, ns, pvName, `srv-${serviceInstanceName}`, volume);
                /* *********************************** */

                throw new Exception("Could not create the PVC");
            }
        }

        // Process the parameters provided
        this.mqttController.logEvent(socketId, "info", "Preparing HELM configuration");
        serviceParams = serviceParams ? serviceParams : {};
        if(serviceParams && service.params){
            for(let p in service.params) {
                if(service.params[p].fill){
                    if(service.params[p].fill == "${pvc}"){
                        serviceParams[p] = `${servicePvc.NAME}`;
                    } else if(service.params[p].fill == "${pv}"){
                        serviceParams[p] = `${servicePv.NAME}`;
                    }
                }
                if(service.params[p].append){
                    serviceParams[p] = `${serviceParams[p]}${service.params[p].append}`;
                }
            }
        }

        let clusterIPServiceName = service.clusterIpServiceName ? service.clusterIpServiceName.split("${instance_name}").join(serviceInstanceName) : null;
        // Deploy HELM service now
        this.mqttController.logEvent(socketId, "info", "Deploying HELM service");
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "deploy_k8s_service", {
            "serviceLabel": serviceLabel,
            "service": service, 
            "serviceParams": serviceParams, 
            "serviceInstanceName": serviceInstanceName,
            "clusterIPServiceName": clusterIPServiceName,
            "overwriteConfigFileContent": overwriteConfigFileContent,
            "ns": ns,
            "pv": servicePv,
            "pvc": servicePvc,
            "node": masterNode,
            "workspaceId": workspaceId
        }, 60 * 1000 * 10);
        if(response.data.status != 200){
            this.mqttController.logEvent(socketId, "error", "Error deploying HELM service, rollback");
            /* ************* ROLLBACK ************ */
            if(service.provision_volume) {
                if(pvcName){
                    await TaskVolumeController.deprovisionPVC({
                        "node": masterNode,
                        "host": masterHost,
                    }, ns, pvcName);
                }
                if(pvName){
                    await TaskVolumeController.deprovisionPV({
                        "node": masterNode,
                        "host": masterHost
                    }, ns, pvName, `srv-${serviceInstanceName}`, volume);
                }
            }
            /* *********************************** */
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        } 

        // Create service DB entry
        this.mqttController.logEvent(socketId, "info", "Create database entry for service");
        let dbService = null;
        try {
            dbService = await DBController.createService(
                workspaceId, 
                serviceLabel, 
                service.version, 
                serviceInstanceName, 
                ns, 
                clusterIPServiceName,
                hasDedicatedVolume, 
                volume ? volume.id : null, 
                servicePv ? servicePv.NAME : null, 
                servicePvc ? servicePvc.NAME : null,
                size
            );

            // Expose service on nginx
            if(exposeService){
                this.mqttController.logEvent(socketId, "info", "Creating proxy routes and ingress rules");
                await TaskNginxController.createNginxRoute(workspaceId, ns, masterHost, masterNode, domainId, dbService, null, workspaceK8SNodes, response.data.data.exposedPorts, service);
            }
        } catch (error) {
            this.mqttController.logEvent(socketId, "error", "Error creating NGinx routes, rollback");
            /* ************* ROLLBACK ************ */
            if(dbService){
                await this.uninstallService(dbService, masterHost, masterNode);
                // await TaskRuntimeController.removeServiceResourcesFromCluster(dbService);
                await DBController.removeService(dbService.id);
            } else if(service.provision_volume) {
                if(pvcName){
                    await TaskVolumeController.deprovisionPVC({
                        "node": masterNode,
                        "host": masterHost
                    }, ns, pvcName);
                }
                if(pvName){
                    await TaskVolumeController.deprovisionPV({
                        "node": masterNode,
                        "host": masterHost
                    }, ns, pvName, `srv-${serviceInstanceName}`, volume);
                }
            }
            /* *********************************** */
            throw error;
        }
        this.mqttController.logEvent(socketId, "info", "Updating workspace VCAP PodPresets");
        // Update pod presets on cluster
        await this.updateClusterPodPresets(workspaceId, ns, masterHost, masterNode);
    }

    /**
     * updateClusterPodPresets
     * @param {*} workspaceId 
     * @param {*} ns 
     * @param {*} masterHost 
     * @param {*} masterNode 
     */
    static async updateClusterPodPresets(workspaceId, ns, masterHost, masterNode) {
        // Update pod presets on cluster
        let serviceAndRoutes = await DBController.getServicesForWsRoutes(workspaceId, ns);
        let podPresetResponse = await this.mqttController.queryRequestResponse(masterHost.ip, "update_cluster_pod_presets", {
            "host": masterHost, 
            "node": masterNode,
            "ns": ns,
            "allServices": serviceAndRoutes
        }, 60 * 1000 * 1);
        if(podPresetResponse.data.status != 200){
            const error = new Error(podPresetResponse.data.message);
            error.code = podPresetResponse.data.status;
            throw error;
        }
    }

   /**
    * uninstallService
    * @param {*} service 
    * @param {*} masterHost 
    * @param {*} masterNode 
    */
    static async uninstallService(service, masterHost, masterNode) {
        // Delete HELM service now
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "delete_k8s_service", {
            service: service,
            node: masterNode
        }, 60 * 1000 * 10);
        
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }
}
TaskServicesController.pendingResponses = {};
TaskServicesController.bussyTaskIds = [];
module.exports = TaskServicesController;