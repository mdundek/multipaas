const DBController = require('../db/index');
const TaskRuntimeController = require('./tasks.runtime');
const TaskVolumeController = require('./tasks.volume');
const TaskNginxController = require('./tasks.nginx');
const NGinxController = require("../nginx/index");

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
     * processScheduledProvisionService
     * @param {*} task 
     */
    static async processScheduledProvisionService(task) {
        task.payload = JSON.parse(task.payload);
        // let snapshotData = null;
        try {
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"PROVISIONNING_SERVICE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            // Take cluster snapshot
            // snapshotData = await this.parent.takeClusterSnapshot(task.targetId);

            if(task.target == "workspace"){
                await this.provisionServiceToTenantWorkspace(
                    task.payload[0].socketId,
                    task.targetId, 
                    task.payload[0].params.ns, 
                    task.payload[0].params.serviceLabel, 
                    task.payload[0].params.service, 
                    task.payload[0].params.overwriteConfigFile, 
                    task.payload[0].params.serviceParams, 
                    task.payload[0].params.instanceName,
                    task.payload[0].params.exposeService,
                    task.payload[0].params.volumeName,
                    task.payload[0].params.pvcSize,
                    task.payload[0].params.domainId
                );
            } else {
                // TODO: Not implemented yet, will become usefull when deployment on global service cluster is requested rather than workspace cluster
                throw new Error("Provisioning service target not implemented yet");
            }
           
            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"PROVISIONNING_SERVICE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            }); 

            // await this.parent.cleanUpClusterSnapshot(snapshotData);
        } catch (error) {
            console.error(error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"PROVISIONNING_SERVICE",
                "component": "task-controller",
                "message": error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * processScheduledDeprovisionService
     * @param {*} task 
     */
    static async processScheduledDeprovisionService(task) {
        task.payload = JSON.parse(task.payload);
        let snapshotData = null;
        let volume = null;
        let restoreVolumeDb = false;
        let podPresetsUpdated = false;
        let dbService = null;
        let masterNode = null;
        let masterHost = null;
        try {
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Collecting environement details");

            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DEPROVISIONNING_SERVICE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(task.payload[0].params.service.workspaceId);
            let allK8SHosts = await DBController.getAllK8sHosts();
            masterNode = workspaceK8SNodes.find(n => n.nodeType == "MASTER");
            masterHost = allK8SHosts.find(o => o.id == masterNode.k8sHostId);
            // Deprovision K8S volume resources
            // snapshotData = await this.parent.takeClusterSnapshot(task.targetId);

            dbService = await DBController.getService(task.payload[0].params.service.id);
            let serviceRoutes = await DBController.getServiceRoutes(task.payload[0].params.service.id);

            this.mqttController.logEvent(task.payload[0].socketId, "info", "Uninstalling service");
            await this.uninstallService(dbService, masterHost, masterNode); // ALso takes care of updating ingress
            
            // await this.parent.cleanUpClusterSnapshot(snapshotData);
            snapshotData = null;

            if(dbService.hasDedicatedVolume) {
                this.mqttController.logEvent(task.payload[0].socketId, "info", "Unmounting dedicated volume from cluster nodes");
                // Delete volume entry from DB
                volume = await DBController.getVolume(dbService.volumeId);
                await TaskVolumeController.detatchAndUnmountLocalVolumeFromClusterVMs(task.payload[0].socketId, task.payload[0].params.service.workspaceId, dbService.volumeId);
                await DBController.removeVolume(volume.id);
                restoreVolumeDb = true;
            }

            await DBController.removeService(dbService.id);

            // Update Pod Presets
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Updating cluster Pod Presets");
            await TaskRuntimeController.updateClusterPodPresets(dbService.workspaceId, dbService.namespace, masterHost, masterNode);
            podPresetsUpdated = true;

            // Update Nginx Proxy
            this.mqttController.logEvent(task.payload[0].socketId, "info", "Updating NGinx configuration");
            let org = await DBController.getOrgForWorkspace(task.payload[0].params.service.workspaceId);
            let account = await DBController.getAccountForOrg(org.id);
            let workspace = await DBController.getWorkspace(task.payload[0].params.service.workspaceId);
            
            await TaskNginxController.deleteConfigServersForVirtualPorts(
                workspaceK8SNodes,
                serviceRoutes, 
                account.name, 
                org.name, 
                workspace.name, 
                dbService
            );

            // Update DB
            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DEPROVISIONNING_SERVICE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });  
        } catch (error) {
            console.error(error);
            this.mqttController.logEvent(task.payload[0].socketId, "error", "Error while deleting service, rollback");
           
            if(restoreVolumeDb){
                await DBController.createVolume(
                    volume.size, 
                    volume.name, 
                    volume.secret, 
                    volume.workspaceId, 
                    volume.type, 
                    volume.portIndex
                );
            }

            if(podPresetsUpdated) {
                await TaskRuntimeController.updateClusterPodPresets(dbService.workspaceId, dbService.namespace, masterHost, masterNode);
            }
         
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DEPROVISIONNING_SERVICE",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
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
                "subFolderName": `ns-${ns}-${pvName}`,
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
                "volume": volume,
                "ns": ns,
                "size": `${size}Mi`,
                "node": masterNode,
                "workspaceId": workspaceId
            }, 60 * 1000 * 5);
            
            if(responsePvc.data.status != 200){
                this.mqttController.logEvent(socketId, "error", "Error while creating the persisted volume claim, rollback");

                await TaskRuntimeController.deprovisionPV({
                    "node": masterNode,
                    "host": masterHost
                }, ns, pvName, `srv-${serviceInstanceName}`, volume);

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
                await TaskRuntimeController.deprovisionPVC({
                    "node": masterNode,
                    "host": masterHost
                }, ns, pvcName);
                await TaskRuntimeController.deprovisionPV({
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
                    await TaskRuntimeController.deprovisionPVC({
                        "node": masterNode,
                        "host": masterHost,
                    }, ns, pvcName);
                }
                if(pvName){
                    await TaskRuntimeController.deprovisionPV({
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
        let dbService = null;
        let newDbRoutes = null;
        let ingressBackups = null;
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
                newDbRoutes = await TaskNginxController.createDbRoutes(
                    workspaceId, 
                    domainId, 
                    dbService, 
                    null, 
                    workspaceK8SNodes, 
                    response.data.data.exposedPorts, 
                    service
                );

                // Update pod presets on cluster
                await TaskRuntimeController.updateClusterPodPresets(workspaceId, ns, masterHost, masterNode);

                ingressBackups = await TaskNginxController.updateWorkspaceIngress(ns, masterHost, masterNode, {
                    services: true,
                    serviceId: dbService.id,
                    apps: false,
                    appId: null,
                    tcp: newDbRoutes.find(route => route.tcpStream) ? true : false
                });
                // Now generate the nginx and ingress configs
                await TaskNginxController.updateAndApplyLoadbalancerConfig(
                    workspaceId, 
                    ns, 
                    workspaceK8SNodes
                );
            }
        } catch (error) {
            console.error(error);
            this.mqttController.logEvent(socketId, "error", "Error creating NGinx routes, rollback");
            /* ************* ROLLBACK ************ */
            if(newDbRoutes) {
                for(let a=0; a<newDbRoutes.length; a++){
                    await DBController.removeRoute(newDbRoutes[a].id);
                }
            }
            if(dbService){
                await this.uninstallService(dbService, masterHost, masterNode);
                await DBController.removeService(dbService.id);
            }
            if(service.provision_volume) {
                if(pvcName){
                    await TaskRuntimeController.deprovisionPVC({
                        "node": masterNode,
                        "host": masterHost
                    }, ns, pvcName);
                }
                if(pvName){
                    await TaskRuntimeController.deprovisionPV({
                        "node": masterNode,
                        "host": masterHost
                    }, ns, pvName, `srv-${serviceInstanceName}`, volume);
                }
            }
            if(ingressBackups) {
                await TaskNginxController.rollbackK8SResources(masterHost, masterNode, ns, ingressBackups.backupConfigs, ingressBackups.newConfigs);
            }
            /* *********************************** */
            throw error;
        }
        this.mqttController.logEvent(socketId, "info", "Updating workspace VCAP PodPresets");
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