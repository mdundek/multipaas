const DBController = require('../db/index');
const TaskNginxController = require('./tasks.nginx');

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

let _capacityToMb = (cap) => {
	let capFloat = parseFloat(cap.substring(0, cap.length-2));
	if(cap.indexOf("Pi") != -1) {
		return Math.round(capFloat * 1073741824);
	} else if(cap.indexOf("Ti") != -1) {
		return Math.round(capFloat * 1024.0 * 1024.0);
	} else if(cap.indexOf("Gi") != -1) {
		return Math.round(capFloat * 1024.0);
	} else if(cap.indexOf("Mi") != -1) {
		return Math.round(capFloat);
	} else if(cap.indexOf("Ki") != -1) {
		return Math.round(capFloat / 1024.0);
	} else {
		return 0;
	}
}

let _normalizeName = (base) => {
    base = base.replace(/[^a-z0-9+]+/gi, '-');
    return base;
}

class TaskAppsController {

    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;
    }

    /**
     * processScheduledDeployAppImage
     * @param {*} task 
     */
    static async processScheduledDeployAppImage(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DEPLOY_IMAGE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            await this.buildImage(task.payload[0].socketId, task.targetId, task.payload[0].params.appZipPath, task.payload[0].params.image, task.payload[0].params.version);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DEPLOY_IMAGE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DEPLOY_IMAGE",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * processScheduledDeleteAppImage
     * @param {*} task 
     */
    static async processScheduledDeleteAppImage(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DELETE_IMAGE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            await this.deleteImage(task.targetId, task.payload[0].params);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DELETE_IMAGE",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DELETE_IMAGE",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        }
    }

    /**
     * processScheduleProvisionApplication
     * @param {*} task 
     */
    static async processScheduleProvisionApplication(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"PROVISION_APP",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            await this.deployNewApp(task.payload[0].socketId, task.payload[0].params);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"PROVISION_APP",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"PROVISION_APP",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * processScheduleScaleApplication
     * @param {*} task 
     */
    static async processScheduleScaleApplication(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"SCALE_APP",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            await this.scaleApp(task.payload[0].socketId, task.payload[0].params);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"SCALE_APP",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"SCALE_APP",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }
    
    /**
     * processScheduleProvisionApplicationVersion
     * @param {*} task 
     */
    static async processScheduleProvisionApplicationVersion(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"PROVISION_APP_VERSION",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            await this.deployNewAppVersion(task.payload[0].socketId, task.payload[0].params);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"PROVISION_APP_VERSION",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"PROVISION_APP_VERSION",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * processScheduleApplicationCanarySplit
     * @param {*} task 
     */
    static async processScheduleApplicationCanarySplit(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"CANARY-SPLIT_APPLICATION",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            await this.applicationCanarySplit(task.payload[0].socketId, task.payload[0].params);

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"CANARY-SPLIT_APPLICATION",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"CANARY-SPLIT_APPLICATION",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * processScheduleReplaceApplicationVersion
     * @param {*} task 
     */
    static async processScheduleReplaceApplicationVersion(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"REPLACE_APP_VERSION",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            // console.log("processScheduleReplaceApplicationVersion =>", JSON.stringify(task.payload, null, 4));
            await this.replaceAppVersion(task.payload[0].socketId, task.payload[0].params);
            
            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"REPLACE_APP_VERSION",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"REPLACE_APP_VERSION",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * processScheduleDeprovisionApplication
     * @param {*} task 
     */
    static async processScheduleDeprovisionApplication(task) {
        task.payload = JSON.parse(task.payload);
        try {
            await DBController.updateTaskStatus(task, "IN_PROGRESS", {
                "type":"INFO",
                "step":"DEPROVISION_APP",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });

            if(task.payload[0].params.appVersionId) {
                await this.deprovisionApplicationVersion(task.payload[0].socketId, task.payload[0].params);
            } else {
                await this.deprovisionApplication(task.payload[0].socketId, task.payload[0].params);
            }

            await DBController.updateTaskStatus(task, "DONE", {
                "type":"INFO",
                "step":"DEPROVISION_APP",
                "component": "task-controller",
                "ts":new Date().toISOString()
            });   
        } catch (error) {
            console.log("ERROR 6 => ", error);
            await DBController.updateTaskStatus(task, "ERROR", {
                "type":"ERROR",
                "step":"DEPROVISION_APP",
                "component": "task-controller",
                "message":error.message,
                "ts":new Date().toISOString()
            });
        } finally {
            this.mqttController.closeEventStream(task.payload[0].socketId);
        }
    }

    /**
     * deprovisionApplicationVersion
     * @param {*} socketId 
     * @param {*} params 
     */
    static async deprovisionApplicationVersion(socketId, params) {
        this.mqttController.logEvent(socketId, "info", "Deleting application version");
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(params.workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        let dbApp = await DBController.getApplication(params.appId);
        let dbAppVersion = await DBController.getApplicationVersion(params.appVersionId);

        let dbClient = await DBController.startTransaction();
        let hadTcpStreaming = false;
        // let ingressBackups = null;
        try {
            let appRoutes = await DBController.getApplicationRoutes(params.appId);
            hadTcpStreaming = appRoutes.find(o => o.tcpStream) ? true : false;

            await DBController.removeAppVersion(dbAppVersion.id, dbClient);
            let dbAppVersionList = await DBController.getApplicationVersionsForApp(params.appId, dbClient);
            dbAppVersionList = dbAppVersionList.filter(o => o.id != dbAppVersion.id);

            let avarageWeight = Math.floor(100 / dbAppVersionList.length);
            let appliedWeight = 0;
            for(let i=0; i<dbAppVersionList.length; i++) {
                if((i+1) == dbAppVersionList.length) {
                    dbAppVersionList[i].weight = 100 - appliedWeight;
                } else {
                    dbAppVersionList[i].weight = avarageWeight;
                    appliedWeight += avarageWeight;
                }
                await DBController.updateApplicationVersionWeight(
                    dbApp.id, 
                    dbAppVersionList[i].registry, 
                    dbAppVersionList[i].image, 
                    dbAppVersionList[i].tag, 
                    dbAppVersionList[i].weight,
                    dbClient
                );
            }

            await this.uninstallApplicationVersion(dbApp, dbAppVersion, masterHost, node);
            await DBController.commitTransaction(dbClient);

            // Expose service on nginx
            if(dbAppVersion.externalServiceName && dbAppVersion.externalServiceName.length > 0){  
                this.mqttController.logEvent(socketId, "info", "Updating ingress configuration");
                
                // Update ingress configs
                await TaskNginxController.updateWorkspaceIngress(dbApp.namespace, masterHost, node, {
                    services: false,
                    serviceId: null,
                    apps: true,
                    appId: params.appId,
                    tcp: hadTcpStreaming
                });

                // Now generate the nginx configs
                await TaskNginxController.updateAndApplyLoadbalancerConfig(
                    dbApp.workspaceId, 
                    dbApp.namespace, 
                    workspaceK8SNodes
                );
            }
        } catch (error) {
            this.mqttController.logEvent(socketId, "error", "An error occured: " + error.message);
            await DBController.rollbackTransaction(dbClient);
            // if(ingressBackups) {
            //     await TaskNginxController.rollbackK8SResources(masterHost, node, dbApp.namespace, ingressBackups.backupConfigs, ingressBackups.newConfigs);
            // }
            throw error;
        }
    }

    /**
     * deprovisionApplication
     * @param {*} socketId 
     * @param {*} params 
     */
    static async deprovisionApplication(socketId, params) {
        this.mqttController.logEvent(socketId, "info", "Deleting application");

        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(params.workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        let dbClient = await DBController.startTransaction();
        let hadTcpStreaming = false;
        try {
            let appRoutes = await DBController.getApplicationRoutes(params.appId);
            hadTcpStreaming = appRoutes.find(o => o.tcpStream) ? true : false;

            // Delete all versions
            let dbApp = await DBController.getApplication(params.appId, dbClient);

            // Delete DB application
            await DBController.removeApp(params.appId, dbClient);

            let allApplicationVersion = await DBController.getApplicationVersionsForApp(params.appId);
            for(let i=0; i<allApplicationVersion.length; i++) {
                await this.uninstallApplicationVersion(dbApp, allApplicationVersion[i], masterHost, node);
            }

            await DBController.commitTransaction(dbClient);
        } catch (error) {
            await DBController.rollbackTransaction(dbClient);
            this.mqttController.logEvent(socketId, "error", "An error occured: " + error.message);
            throw error;
        }

        this.mqttController.logEvent(socketId, "info", "Updating load balancer configuration");
        // let ingressBackups = null;
        try {
            await TaskNginxController.updateWorkspaceIngress(params.ns, masterHost, node, {
                services: false,
                serviceId: null,
                apps: true,
                appId: params.appId,
                tcp: hadTcpStreaming
            });

            // Now generate the nginx and ingress configs
            await TaskNginxController.updateAndApplyLoadbalancerConfig(
                params.workspaceId, 
                params.ns, 
                workspaceK8SNodes
            ); 
        } catch (error) {
            this.mqttController.logEvent(socketId, "error", "An error occured: " + error.message);
            // if(ingressBackups) {
            //     await TaskNginxController.rollbackK8SResources(masterHost, node, params.ns, ingressBackups.backupConfigs, ingressBackups.newConfigs);
            // }
            throw error;
        }
    }

    /**
     * buildImage
     * @param {*} socketId 
     * @param {*} workspaceId 
     * @param {*} zipPath 
     * @param {*} imageName 
     * @param {*} imageVersion 
     */
    static async buildImage(socketId, workspaceId, zipPath, imageName, imageVersion) {
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        // Instruct node host to build and push image
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "build_publish_k8s_image", {
            "zipPath": zipPath,
            "imageName": imageName,
            "imageVersion": imageVersion,
            "node": node,
            "socketId": socketId
        }, 60 * 1000 * 15);
        
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }

    /**
     * deleteImage
     * @param {*} workspaceId 
     * @param {*} imageNameAndTag 
     */
    static async deleteImage(workspaceId, data) {
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        // Instruct node host to build and push image
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "delete_k8s_image", {
            "imageName": data.image,
            "imageTag": data.tag,
            "node": node
        }, 60 * 1000 * 15);
        
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }

    /**
     * deployNewApp
     * @param {*} socketId 
     * @param {*} params 
     */
    static async deployNewApp(socketId, params) {
        this.mqttController.logEvent(socketId, "info", "Deploying new application version");
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(params.workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        // Extract registry image details
        let imageSplit = params.image.split("/");
        let registry = imageSplit.shift();
        let remaining = imageSplit.join("/");
        let tagSplit = remaining.split(":");
        let tag = tagSplit.pop();
        let imagePath = tagSplit.join("/");

        params.registry = registry;
        params.repository = imagePath;
        params.tag = tag;
        
        // Get volume & pvc details
        let pvName = null;
        let pvcName = null;
        let pvcSize = null;
        let volumeId = null;
        if(params.pvc.length > 0) {
            pvcName = params.pvc[0].name;
            let volumeHashResponse = await this.mqttController.queryRequestResponse(masterHost.ip, "get_k8s_resource_values", {
                "target": "pvc",
                "targetName": pvcName,
                "ns": params.ns,
                "jsonpath": "{@.metadata.labels.volumeHash},{@.spec.selector.matchLabels.app},{@.spec.resources.requests.storage}",
                "node": node
            }, 15000);
    
            let detailsSplit = volumeHashResponse.data.output[0].split(",");
            let volumeHash = detailsSplit[0];
            pvName = detailsSplit[1];
            pvcSize = _capacityToMb(detailsSplit[2]);
            let volume = await DBController.getVolumeByHash(params.workspaceId, volumeHash);
            volumeId = volume.id;
        }

        let dbApp = null;
        let dbAppVersion = null;
        let appDeployed = false;
        let newDbRoutes = null;
        let ingressBackups = null;
        try{
            // Create application in DB
            dbApp = await DBController.createApplication(
                params.workspaceId, 
                params.name, 
                params.ns, 
                JSON.stringify(params)
            );

            // Create application version in DB
            dbAppVersion = await DBController.createApplicationVersion(
                _normalizeName(`${params.name}-${tag}`), 
                registry, 
                tag, 
                imagePath, 
                params.replicaCount, 
                pvName, 
                pvcName, 
                false, 
                pvcSize, 
                100, 
                volumeId, 
                dbApp.id,
            );
            
            // Instruct node host to build and push image
            let response = await this.mqttController.queryRequestResponse(masterHost.ip, "deploy_new_app", {
                "node": node,
                "host": masterHost,
                "deployParams": params,
                "socketId": socketId
            }, 60 * 1000 * 15);

            if(response.data.status != 200){
                const error = new Error(response.data.message);
                error.code = response.data.status;
                throw error;
            }
            appDeployed = true;

            // Expose service on nginx
            if(params.exposeService){
                let serviceConfig = {
                    portConfig: params.ports.map(p => {
                        return {
                            port: p.containerPort,
                            tcpStream: p.isTcpStream
                        };
                    })
                };
                this.mqttController.logEvent(socketId, "info", "Updating ingress configuration");
                newDbRoutes = await TaskNginxController.createDbRoutes(
                    params.workspaceId, 
                    params.domainId, 
                    null, 
                    dbApp, 
                    workspaceK8SNodes, 
                    response.data.data.exposedPorts, 
                    serviceConfig
                );

                ingressBackups = await TaskNginxController.updateWorkspaceIngress(dbApp.namespace, masterHost, node, {
                    services: false,
                    serviceId: null,
                    apps: true,
                    appId: dbApp.id,
                    tcp: newDbRoutes.find(route => route.tcpStream) ? true : false
                });

                // Now generate the nginx and ingress configs
                await TaskNginxController.updateAndApplyLoadbalancerConfig(
                    params.workspaceId, 
                    params.ns, 
                    workspaceK8SNodes
                );
            }
        } catch (error) {
            console.log(error);
            this.mqttController.logEvent(socketId, "error", "An error occured, rolling back");
            /* ************* ROLLBACK ************ */
            if(newDbRoutes) {
                for(let a=0; a<newDbRoutes.length; a++){
                    await DBController.removeRoute(newDbRoutes[a].id);
                }
            }
            if(appDeployed) {
                await this.uninstallApplicationVersion(dbApp, dbAppVersion, masterHost, node);
            }
            if(dbApp) {
                await DBController.removeApp(dbApp.id);
            }

            if(ingressBackups) {
                await TaskNginxController.rollbackK8SResources(masterHost, node, dbApp.namespace, ingressBackups.backupConfigs, ingressBackups.newConfigs);
            }

            /* *********************************** */
            throw error;
        }
    }

    /**
     * deployNewAppVersion
     * @param {*} socketId 
     * @param {*} params 
     */
    static async deployNewAppVersion(socketId, params) {
        this.mqttController.logEvent(socketId, "info", "Deploying new application version");
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(params.workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        // Extract registry image details
        let imageSplit = params.image.split("/");
        let registry = imageSplit.shift();
        let remaining = imageSplit.join("/");
        let tagSplit = remaining.split(":");
        let tag = tagSplit.pop();
        let imagePath = tagSplit.join("/");

        params.registry = registry;
        params.repository = imagePath;
        params.tag = tag;
        
        // Get volume & pvc details
        let pvName = null;
        let pvcName = null;
        let pvcSize = null;
        let volumeId = null;
        if(params.pvc.length > 0) {
            pvcName = params.pvc[0].name;
            let volumeHashResponse = await this.mqttController.queryRequestResponse(masterHost.ip, "get_k8s_resource_values", {
                "target": "pvc",
                "targetName": pvcName,
                "ns": params.ns,
                "jsonpath": "{@.metadata.labels.volumeHash},{@.spec.selector.matchLabels.app},{@.spec.resources.requests.storage}",
                "node": node
            }, 15000);

            let detailsSplit = volumeHashResponse.data.output[0].split(",");
            let volumeHash = detailsSplit[0];
            pvName = detailsSplit[1];
            pvcSize = _capacityToMb(detailsSplit[2]);
            let volume = await DBController.getVolumeByHash(params.workspaceId, volumeHash);
            volumeId = volume.id;
        }

        let dbApp = await DBController.getApplication(params.appId);
        let dbAppVersion = null;
        let appVersionDeployed = false;
        try{
            let dbClient = await DBController.startTransaction();
            try {
                for(let i=0; i<params.trafficSplit.length; i++) {
                    if(params.trafficSplit[i].image == params.image) {
                        // Create application version in DB
                        dbAppVersion = await DBController.createApplicationVersion(
                            _normalizeName(`${params.name}-${tag}`), 
                            registry, 
                            tag, 
                            imagePath, 
                            params.replicaCount, 
                            pvName, 
                            pvcName, 
                            false, 
                            pvcSize, 
                            params.trafficSplit[i].weight, 
                            volumeId, 
                            dbApp.id,
                            dbClient
                        );
                    } else {
                        let _imageSplit = params.trafficSplit[i].image.split("/");
                        let _registry = _imageSplit.shift();
                        let _remaining = _imageSplit.join("/");
                        let _tagSplit = _remaining.split(":");
                        let _tag = _tagSplit.pop();
                        let _imagePath = _tagSplit.join("/");
                        await DBController.updateApplicationVersionWeight(
                            dbApp.id, 
                            _registry, 
                            _imagePath, 
                            _tag, 
                            params.trafficSplit[i].weight,
                            dbClient
                        );
                    }
                }
                await DBController.commitTransaction(dbClient);      
            } catch (_error) {
                this.mqttController.logEvent(socketId, "error", "AN error occured: " + _error.message);
                await DBController.rollbackTransaction(dbClient);   
                throw _error;             
            }
            
            // Instruct node host to build and push image
            let response = await this.mqttController.queryRequestResponse(masterHost.ip, "deploy_new_app", {
                "node": node,
                "host": masterHost,
                "deployParams": params,
                "socketId": socketId
            }, 60 * 1000 * 15);

            if(response.data.status != 200){
                const error = new Error(response.data.message);
                error.code = response.data.status;
                throw error;
            }
            appVersionDeployed = true;

            // Expose service on nginx
            if(params.exposeService){
                this.mqttController.logEvent(socketId, "info", "Updating ingress configuration");
                let appRoutes = await DBController.getApplicationRoutes(params.appId);
                // Now generate the nginx and ingress configs
                await TaskNginxController.updateWorkspaceIngress(
                    params.ns, 
                    masterHost, 
                    node, 
                    {
                        services: false,
                        serviceId: null,
                        apps: true,
                        appId: params.appId,
                        tcp: appRoutes.find(r => r.tcpStream) ? true : false
                    }
                );
            }
        } catch (error) {
            console.log(error);
            this.mqttController.logEvent(socketId, "error", "An error occured, rolling back");
            /* ************* ROLLBACK ************ */
            if(appVersionDeployed) {
                await this.uninstallApplicationVersion(dbApp, dbAppVersion, masterHost, node);
            }
            if(dbAppVersion) {
                await DBController.removeAppVersion(dbAppVersion.id);
            }
            /* *********************************** */
            throw error;
        }
    }

    /**
     * applicationCanarySplit
     * @param {*} socketId 
     * @param {*} params 
     */
    static async applicationCanarySplit(socketId, params) {
        this.mqttController.logEvent(socketId, "info", "Assigning weight");
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(params.workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);
        let dbApp = await DBController.getApplication(params.appId);
       
        try{
            let dbClient = await DBController.startTransaction();
            try {
                for(let i=0; i<params.trafficSplit.length; i++) {
                    let _imageSplit = params.trafficSplit[i].image.split("/");
                    let _registry = _imageSplit.shift();
                    let _remaining = _imageSplit.join("/");
                    let _tagSplit = _remaining.split(":");
                    let _tag = _tagSplit.pop();
                    let _imagePath = _tagSplit.join("/");
                    await DBController.updateApplicationVersionWeight(
                        dbApp.id, 
                        _registry, 
                        _imagePath, 
                        _tag, 
                        params.trafficSplit[i].weight,
                        dbClient
                    );
                }
                await DBController.commitTransaction(dbClient);      
            } catch (_error) {
                this.mqttController.logEvent(socketId, "error", "An error occured: " + _error.message);
                await DBController.rollbackTransaction(dbClient);   
                throw _error;             
            }
            
            this.mqttController.logEvent(socketId, "info", "Updating ingress configuration");
            // Now generate the nginx and ingress configs
            await TaskNginxController.updateWorkspaceIngress(
                params.ns, 
                masterHost, 
                node, 
                {
                    services: false,
                    serviceId: null,
                    apps: true,
                    appId: params.appId,
                    tcp: false
                }
            );
        } catch (error) {
            console.log(error);
            this.mqttController.logEvent(socketId, "error", "An error occured");
            throw error;
        }
    }

    /**
     * scaleApp
     * @param {*} socketId 
     * @param {*} params 
     */
    static async scaleApp(socketId, params) {
        this.mqttController.logEvent(socketId, "info", "Scaling");
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(params.workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let host = allK8SHosts.find(h => h.id == node.k8sHostId);
        let dbAppVersion = await DBController.getApplicationVersion(params.appVersionId);
        try{
            let scaleAppResponse = await this.mqttController.queryRequestResponse(host.ip, "scale_application", {
                "deployment": dbAppVersion.externalServiceName,
                "replicaCount": params.replicaCount,
                "ns": params.ns,
                "node": node
            }, 15000);
            if(scaleAppResponse.data.status != 200){
                const error = new Error(scaleAppResponse.data.message);
                error.code = scaleAppResponse.data.status;
                throw error;
            }
        } catch (error) {
            console.log(error);
            this.mqttController.logEvent(socketId, "error", "An error occured");
            throw error;
        }
    }

    /**
     * replaceAppVersion
     * @param {*} socketId 
     * @param {*} params 
     */
    static async replaceAppVersion(socketId, params) {
        this.mqttController.logEvent(socketId, "info", "Deploying new application version");
        // Collect workspace nodes and hosts
        let workspaceK8SNodes = await DBController.getAllK8sWorkspaceNodes(params.workspaceId);
        let allK8SHosts = await DBController.getAllK8sHosts();
        let node = workspaceK8SNodes.find(o => o.nodeType == "MASTER");
        let masterHost = allK8SHosts.find(h => h.id == node.k8sHostId);

        // Extract registry image details
        let imageSplit = params.image.split("/");
        let registry = imageSplit.shift();
        let remaining = imageSplit.join("/");
        let tagSplit = remaining.split(":");
        let tag = tagSplit.pop();
        let imagePath = tagSplit.join("/");

        params.registry = registry;
        params.repository = imagePath;
        params.tag = tag;
        
        // Get volume & pvc details
        let pvName = null;
        let pvcName = null;
        let pvcSize = null;
        let volumeId = null;
        if(params.pvc.length > 0) {
            pvcName = params.pvc[0].name;
            let volumeHashResponse = await this.mqttController.queryRequestResponse(masterHost.ip, "get_k8s_resource_values", {
                "target": "pvc",
                "targetName": pvcName,
                "ns": params.ns,
                "jsonpath": "{@.metadata.labels.volumeHash},{@.spec.selector.matchLabels.app},{@.spec.resources.requests.storage}",
                "node": node
            }, 15000);

            let detailsSplit = volumeHashResponse.data.output[0].split(",");
            let volumeHash = detailsSplit[0];
            pvName = detailsSplit[1];
            pvcSize = _capacityToMb(detailsSplit[2]);
            let volume = await DBController.getVolumeByHash(params.workspaceId, volumeHash);
            volumeId = volume.id;
        }

        let dbApp = await DBController.getApplication(params.appId);
        let dbAppVersion = null;
        let appVersionDeployed = false;

        let dbClient = await DBController.startTransaction();
        try{
            let replaceVersion = await DBController.getApplicationVersion(params.appVersionReplaceId);

            dbAppVersion = await DBController.createApplicationVersion(
                _normalizeName(`${params.name}-${tag}`), 
                registry, 
                tag, 
                imagePath, 
                params.replicaCount, 
                pvName, 
                pvcName, 
                false, 
                pvcSize, 
                replaceVersion.weight, 
                volumeId, 
                dbApp.id,
                dbClient
            );

            // Instruct node host to build and push image
            let response = await this.mqttController.queryRequestResponse(masterHost.ip, "deploy_new_app", {
                "node": node,
                "host": masterHost,
                "deployParams": params,
                "socketId": socketId
            }, 60 * 1000 * 15);

            if(response.data.status != 200){
                const error = new Error(response.data.message);
                error.code = response.data.status;
                throw error;
            }
            appVersionDeployed = true;

            await DBController.removeAppVersion(replaceVersion.id);
            await DBController.commitTransaction(dbClient);      

            // Expose service on nginx
            if(params.exposeService){
                this.mqttController.logEvent(socketId, "info", "Update ingress configuration");
                let appRoutes = await DBController.getApplicationRoutes(params.appId);
                // Now generate the nginx and ingress configs
                await TaskNginxController.updateWorkspaceIngress(
                    params.ns, 
                    masterHost, 
                    node, 
                    {
                        services: false,
                        serviceId: null,
                        apps: true,
                        appId: params.appId,
                        tcp: appRoutes.find(route => route.tcpStream) ? true : false
                    }
                );
            }
            this.mqttController.logEvent(socketId, "info", "Deleting old application version");
            await this.uninstallApplicationVersion(dbApp, replaceVersion, masterHost, node);
        } catch (error) {
            console.log(error);
            this.mqttController.logEvent(socketId, "info", "An error occured, rolling back");
            /* ************* ROLLBACK ************ */
            if(appVersionDeployed) {
                await this.uninstallApplicationVersion(dbApp, dbAppVersion, masterHost, node);
            }
            await DBController.rollbackTransaction(dbClient);   
            /* *********************************** */
            throw error;
        }
    }

    /**
     * uninstallApplicationVersion
     * @param {*} application 
     * @param {*} applicationVersion 
     * @param {*} masterHost 
     * @param {*} masterNode 
     */
   static async uninstallApplicationVersion(application, applicationVersion, masterHost, masterNode) {
        // Delete HELM service now
        let response = await this.mqttController.queryRequestResponse(masterHost.ip, "delete_k8s_application_version", {
            application: application,
            applicationVersion: applicationVersion,
            node: masterNode
        }, 60 * 1000 * 10);
        
        if(response.data.status != 200){
            const error = new Error(response.data.message);
            error.code = response.data.status;
            throw error;
        }
    }
}
TaskAppsController.pendingResponses = {};
TaskAppsController.bussyTaskIds = [];
module.exports = TaskAppsController;