const OSController = require("../os/index");
const DBController = require("../db/index");
const shortid = require('shortid');
const path = require('path');
const YAML = require('yaml');
const fs = require('fs');
const rmfr = require('rmfr');
const mkdirp = require('mkdirp');
const _ = require('lodash');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

// const ssh = new node_ssh();
let EngineController;

class TaskRuntimeController {
    
    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;

        // Prepare the environment scripts
        if(process.env.CLUSTER_ENGINE == "virtualbox") {
            EngineController = require("./engines/vb/index");
        }
    }

    /**
     * deployWorkspaceCluster
     */
    static async deployWorkspaceCluster(socketId, ip, workspaceId) {
        let result = null;
        try {
            let dbHostNode = await DBController.getK8SHostByIp(ip);
            let org = await DBController.getOrgForWorkspace(workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);

            if(!dbHostNode){
                throw new Error("Could not find K8SHost in database");
            }

            result = await EngineController.deployNewCluster(dbHostNode, workspaceId, org.registryUser, rPass, (eventMessage) => {
                this.mqttController.logEvent(socketId, "info", eventMessage);
            });

            await DBController.createK8SMasterNode(result.nodeIp, result.nodeHostname, result.workspaceId, result.hostId, result.hash);
        } catch (err) {
            this.mqttController.logEvent(socketId, "error", "An error occured while deploying Cluster, rollback");
            // The deploy finished, error occured during DB update. Need to roolback everything
            if(result){
                try{
                    let created = await EngineController.vmExists(`master.${result.hash}`);
                    if(created){
                        await EngineController.stopDeleteVm(`master.${result.hash}`, workspaceId);
                    }
                    
                    if(result.leasedIp){
                        this.mqttController.client.publish(`/mycloud/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                            leasedIp: result.leasedIp
                        }));
                    }
                } catch(_err) {
                    // TODO: Log rollback error
                    console.log(_err);
                }
            }

            throw err;
        }
    }

    /**
     * getK8sResources
     * @param {*} ip 
     * @param {*} data 
     */
    static async getK8sResources(topicSplit, ip, data) {
        try{
            let resourceResponses = {};
            for(let i=0; i<data.targets.length; i++) {
                let result = await EngineController.getK8SResources(
                    data.node, 
                    data.ns, 
                    data.targets[i], 
                    (data.targetNames && data.targetNames.length >= (i+1)) ? data.targetNames[i] : null,
                    data.json ? data.json : false
                );
                resourceResponses[data.targets[i]] = result
            }
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "get k8s resources",
                output: resourceResponses
            }));
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "get k8s resources",
                data: data
            }));
        }
    }

    /**
     * getK8SResourceValues
     * @param {*} ip 
     * @param {*} data 
     */
    static async getK8SResourceValues(topicSplit, ip, data) {
        try{
            let result = await EngineController.getK8SResourceValues(data.node, data.ns, data.target, data.targetName, data.jsonpath);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "get k8s resource values",
                output: result
            }));
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "get k8s resource values",
                data: data
            }));
        }
    }
    
    /**
     * mountK8SNodeGlusterVolume
     * @param {*} ip 
     * @param {*} data 
     */
    static async mountK8SNodeGlusterVolume(topicSplit, ip, data) {
        let volumeName = data.volume.name + "-" + data.volume.secret;
        let volumeGlusterHosts = null;
        try {
            volumeGlusterHosts = await DBController.getGlusterHostsByVolumeId(data.volume.id);
            if(volumeGlusterHosts.length == 0){
                throw new Error("The volume does not have any gluster peers");
            }
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "bind volume"
            }));
            return;
        }

        try {
            await EngineController.mountGlusterVolume(data.nodeProfile.node, volumeName, volumeGlusterHosts[0].ip);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "bind volume"
            }));
        } catch (error) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "bind volume"
            }));
        }
    }

    /**
     * attachLocalVolumeToVM
     * @param {*} ip 
     * @param {*} data 
     */
    static async attachLocalVolumeToVM(topicSplit, ip, data) {
        let volumeName = data.volume.name + "-" + data.volume.secret
        try {

            let nextPortIndex = await EngineController.getNextSATAPortIndex(data.nodeProfile.node.hostname);
            if(nextPortIndex == null){
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 500,
                    message: "No more port indexes available",
                    task: "bind volume"
                }));
                return;
            }

            await DBController.setVolumePortIndex(data.volume.id, nextPortIndex);
            // try {
            await EngineController.attachLocalVolumeToVM(data.workspaceId, data.nodeProfile.node, volumeName, data.volume.size, nextPortIndex);
            // } catch (_e) {
            //     // await DBController.setVolumePortIndex(data.volume.id, null);
            //     throw _e;
            // }
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "bind volume"
            }));
        } catch (error) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "bind volume"
            }));
        }
    }

    /**
     * unmountK8SNodeGlusterVolume
     * @param {*} ip 
     * @param {*} data 
     */
    static async unmountK8SNodeGlusterVolume(topicSplit, ip, data) {
        let volumeName = data.volume.name + "-" + data.volume.secret;
        try {
            let volumeGlusterHosts = await DBController.getGlusterHostsByVolumeId(data.volume.id);
            if(volumeGlusterHosts.length == 0){
                throw new Error("The volume does not have any gluster peers");
            }
            await EngineController.unmountVolume(data.nodeProfile.node, volumeName);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "unbind volume",
                data: data
            }));
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "unbind volume",
                data: data
            }));
        }
    }

    /**
     * detatchLocalVolumeFromVM
     * @param {*} ip 
     * @param {*} data 
     */
    static async detatchLocalVolumeFromVM(topicSplit, ip, data) {
        try {
            let volume = await DBController.getVolume(data.volumeId);
            if(volume.portIndex == null){
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "detatch volume"
                }));
                return;
            }
            
            await EngineController.detatchLocalK8SVolume(data.node, volume.portIndex, data.delDiskFile, data.skipRestart);

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "detatch volume",
                data: data
            }));
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "detatch volume",
                data: data
            }));
        }
    }

    /**
     * deleteLocalVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async deleteLocalVolume(topicSplit, ip, data) {
        try {
            let volume = await DBController.getVolume(data.volumeId);
            let volumeName = volume.name + "-" + volume.secret;
            await EngineController.cleanUpDeletedVolume(data.node, volumeName);

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete local volume",
                data: data
            }));
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "delete local volume",
                data: data
            }));
        }
    }

    /**
     * unmountK8SNodeLocalVolume
     * @param {*} ip 
     * @param {*} data 
     */
    static async unmountK8SNodeLocalVolume(topicSplit, ip, data) {
        try {
             await EngineController.unmountVolume(data.nodeProfile.node, data.volumeMountName);
             
             this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                 status: 200,
                 task: "unbind volume",
                 data: data
             }));
        } catch (err) {
             this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                 status: err.code ? err.code : 500,
                 message: err.message,
                 task: "unbind volume",
                 data: data
             }));
 
        }
     }

    /**
     * mountK8SNodeLocalVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async mountK8SNodeLocalVolume(topicSplit, ip, data) {
        try {
             await EngineController.mountLocalVolume(data.node, data.mountFolderName, data.volume.portIndex);
             
             this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                 status: 200,
                 task: "mount volume",
                 data: data
             }));
         } catch (err) {
             this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                 status: err.code ? err.code : 500,
                 message: err.message,
                 task: "mount volume",
                 data: data
             }));
         }
    }

    /**
     * deleteWorkspaceFile
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async deleteWorkspaceFile(topicSplit, ip, data) {
        let tFile = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, data.fileName);
        try {
            await OSController.execSilentCommand(`rm -rf ${tFile}`);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete file",
                data: data
            }));
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "delete file",
                data: data
            }));
        }
    }

    /**
     * deployK8SPersistantVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async deployK8SPersistantVolume(topicSplit, ip, data) {
        try {
            let pvTemplate = YAML.parse(fs.readFileSync(path.join(__dirname, "k8s_templates/persistant-volume.yaml"), 'utf8'));

            pvTemplate.metadata.name = data.pvName;
            pvTemplate.metadata.labels.app  = data.pvName;
            pvTemplate.spec.capacity.storage = `${data.size}Mi`;
            pvTemplate.spec.local.path = `/mnt/${data.volume.name}-${data.volume.secret}/${data.subFolderName}`;
            pvTemplate.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values = data.hostnames;
    
            let yamlTmpPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.workspaceId.toString(), data.node.hostname, `pv.yml`);
            fs.writeFileSync(yamlTmpPath, YAML.stringify(pvTemplate));

           
            let r = await EngineController.sshExec(data.node.ip, `mkdir -p ${pvTemplate.spec.local.path}`, true);
            if(r.code != 0) {
                console.log(r);
                throw new Error("Could not create folders");
            } 

            await EngineController.applyK8SYaml(yamlTmpPath, data.ns, data.node);     
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy persistant volume",
                data: data
            }));
        } catch (error) {
            console.log("ERROR 2 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume",
                data: data
            }));
        }
    }

    /**
     * createServicePvDir
     * @param {
     * } topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async createServicePvDir(topicSplit, ip, data) {
        try {
            let r = await EngineController.sshExec(data.node.ip, `mkdir -p /mnt/${data.volume.name}-${data.volume.secret}/${data.subFolderName}`, true);
            if(r.code != 0) {
                console.log(r);
                throw new Error("Could not create folders");
            } 
  
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy persistant volume",
                data: data
            }));
        } catch (error) {
            console.log("ERROR 2 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume",
                data: data
            }));
        }
    }

    /**
     * deployK8SService
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async deployK8SService(topicSplit, ip, data) {
        let tmpFolderHash = null;
        while(tmpFolderHash == null){
            tmpFolderHash = shortid.generate();
            if(tmpFolderHash.indexOf("$") != -1 || tmpFolderHash.indexOf("@") != -1){
                tmpFolderHash = null;
            }
        }
        
        let chartTmpFolder = path.join(process.env.VM_BASE_DIR, "workplaces", data.workspaceId.toString(), data.node.hostname, tmpFolderHash);
        try {
            let response = await this.mqttController.queryRequestResponse("api", "get_chart_binary", {
                "service": data.serviceLabel,
                "version": data.service.version
            });
            if(response.data.status != 200){
                throw new Error("Could not get chart binary");
            }  
            
            let tarTmpPath = path.join(chartTmpFolder, data.service.chartFile);
            
            let tmp_working_dir = null;
            if(data.overwriteConfigFileContent) {
                tmp_working_dir = path.join(chartTmpFolder, "_decompressed");
                mkdirp.sync(tmp_working_dir);
                tarTmpPath = path.join(tmp_working_dir, data.service.chartFile);
                
                await OSController.writeBinaryToFile(tarTmpPath, response.data.data);
                await OSController.untar(tarTmpPath, true);

                let configOverwrite = YAML.parse(data.overwriteConfigFileContent);

                let filesInDir = fs.readdirSync(tmp_working_dir);
                if(filesInDir.length == 1 && fs.existsSync(path.join(tmp_working_dir, data.serviceLabel))){
                    // Modify chart
                    let valuesFilePath = path.join(tmp_working_dir, data.serviceLabel, "values.yaml");
                    let serviceValues = YAML.parse(fs.readFileSync(valuesFilePath, 'utf8'));
                    const _serviceValues = _.merge(serviceValues, configOverwrite);
                    fs.writeFileSync(valuesFilePath, YAML.stringify(_serviceValues));

                    await OSController.tar(path.join(tmp_working_dir, data.serviceLabel), tarTmpPath);
                } else {
                    // Modify chart
                    let valuesFilePath = path.join(tmp_working_dir, "values.yaml");
                    let serviceValues = YAML.parse(fs.readFileSync(valuesFilePath, 'utf8'));
                    const _serviceValues = _.merge(serviceValues, configOverwrite);
                    fs.writeFileSync(valuesFilePath, YAML.stringify(_serviceValues));

                    await OSController.tar(tmp_working_dir, tarTmpPath);
                }
            } else {
                tarTmpPath = path.join(chartTmpFolder, data.service.chartFile);
                await OSController.writeBinaryToFile(tarTmpPath, response.data.data);
            }
           
            let result = await EngineController.deployHelmService(data.serviceInstanceName, data.ns, data.serviceParams, data.node, tarTmpPath, data.clusterIPServiceName);   
            
            if(tmp_working_dir){
                await rmfr(tmp_working_dir);
            }
            
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy service",
                data: result
            }));
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy service"
            }));
        } finally {
            OSController.rmrf(chartTmpFolder);
        }
    }

    /**
     * updateClusterIngressRules
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async updateClusterIngressRules(topicSplit, data) {
        let ingressYamlPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, "ingress-rules.yaml"); 
        let backupYamlContent = null;
        try{
            // Grap DB references
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let account = await DBController.getAccountForOrg(org.id);
            let services = await DBController.getServicesForWsRoutes(data.node.workspaceId, data.ns);
            let applications = await DBController.getApplicationsForWsRoutes(data.node.workspaceId, data.ns);

            let allServices = services.concat(applications);
            
            // Prepare ingress rules yaml file
            let ingressYaml = YAML.parse(fs.readFileSync(ingressYamlPath, 'utf8'));
            backupYamlContent = JSON.parse(JSON.stringify(ingressYaml));

            ingressYaml.spec.rules = [];

            // Count available ports for each service
            let baseNamesPortCount = {};
            for(let i=0; i<allServices.length; i++){
                if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName){
                    let serverBaseName = `${account.name}-${org.name}-${allServices[i].workspaceName}-${allServices[i].namespace}-${allServices[i].name}`.toLowerCase();
                    if(!baseNamesPortCount[serverBaseName]) {
                        baseNamesPortCount[serverBaseName] = 1;
                    } else {
                        baseNamesPortCount[serverBaseName] = baseNamesPortCount[serverBaseName]+1;
                    }
                }
            }

            // Loop over services first
            let allServiceNames = [];
            for(let i=0; i<allServices.length; i++){
                if(allServices[i].serviceType == "ClusterIP" && allServices[i].externalServiceName && !allServices[i].tcpStream){
                    let baseHostPath = `${account.name}-${org.name}-${allServices[i].workspaceName}-${allServices[i].namespace}-${allServices[i].name}`.toLowerCase();
                    if(baseNamesPortCount[baseHostPath] > 1){
                        baseHostPath = `${baseHostPath}-${allServices[i].port}`;
                    }

                    // Create new rule for this service
                    let rule = {
                        host: `${baseHostPath}${allServices[i].domainName ? `.${allServices[i].domainName}` : ""}`.toLowerCase(),
                        http: {
                            paths: [
                                {
                                    path: "/",
                                    backend: {
                                        serviceName: allServices[i].externalServiceName,
                                        servicePort: allServices[i].port
                                    }
                                }
                            ] 
                        }
                    };
                    // Now push it to the rules array
                    ingressYaml.spec.rules.push(rule);
                    allServiceNames.push(allServices[i].externalServiceName);
                }
            }

            // Enable websocket capabilities for all services
            ingressYaml.metadata.annotations["nginx.org/websocket-services"] = allServiceNames.join(",");
           
            // console.log("=>", YAML.stringify(ingressYaml));

            if(ingressYaml.spec.rules.length > 0) {
                fs.writeFileSync(ingressYamlPath, YAML.stringify(ingressYaml));
                await EngineController.applyK8SYaml(ingressYamlPath, data.ns, data.node);
            } else {
                await EngineController.deleteK8SResource(data.node, data.ns, "ingress", "workspace-ingress");
            }
            
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "update cluster ingress"
            }));
        } catch (error) {
            console.log("ERROR =>", error);
            if(backupYamlContent && backupYamlContent.spec.rules && backupYamlContent.spec.rules.length > 0) {
                fs.writeFileSync(ingressYamlPath, YAML.stringify(backupYamlContent));
                try { await EngineController.applyK8SYaml(ingressYamlPath, data.ns, data.node); } catch (_e) {}
            }
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "update cluster ingress",
                data: data
            }));
        }
    }

    /**
     * updateClusterPodPresets
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async updateClusterPodPresets(topicSplit, data) {
        try{
            let response = await this.mqttController.queryRequestResponse("api", "get_services_config", {});
            if(response.data.status != 200){
                throw new Error("Could not get services configs");
            }  

            let VCAPS = {};
            for(let i=0; i<data.allServices.length; i++) {
                if(!VCAPS[data.allServices[i].serviceName]) {
                    VCAPS[data.allServices[i].serviceName] = [];
                }

                let SERVICE_VCAPS = {
                    name: data.allServices[i].name
                };
                if(data.allServices[i].externalServiceName && data.allServices[i].externalServiceName.length > 0){
                    SERVICE_VCAPS.dns = `${data.allServices[i].externalServiceName}.${data.allServices[i].namespace}.svc.cluster.local`;
                }
                
                let serviceConfig = response.data.services[data.allServices[i].serviceName].versions.find(v => v.version == data.allServices[i].serviceVersion);
                if(serviceConfig && serviceConfig.vcap){
                    for(let envName in serviceConfig.vcap) {
                        if(serviceConfig.vcap[envName].indexOf("secret.") == 0){
                            let paramSplit = serviceConfig.vcap[envName].split(".");
                            paramSplit.shift();
                            let secretParamName = paramSplit.pop();
                            let secretName = paramSplit[0];

                            let secretResolvedName = secretName.split("${instance-name}").join(data.allServices[i].name);
                            
                            let output = await EngineController.getK8SResourceValues(data.node, data.ns, "secret", secretResolvedName, `{.data.${secretParamName}}`, true);   
                            if(output.length == 1 && output[0].length > 0){
                                SERVICE_VCAPS[envName] = output[0];
                            }
                        }
                    }
                }
                VCAPS[data.allServices[i].serviceName].push(SERVICE_VCAPS);
            }
          
            let ppTemplate = YAML.parse(fs.readFileSync(path.join(__dirname, "k8s_templates/pod-preset.yaml"), 'utf8'));
            ppTemplate.spec.env[0].value = JSON.stringify(VCAPS);
          
            let yamlTmpPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `pp.yml`);
            fs.writeFileSync(yamlTmpPath, YAML.stringify(ppTemplate));
           
            try {
                let existingPp = await EngineController.getK8SResources(data.node, data.ns, "podpreset", ["ws-vcap"]);   
                if(existingPp.length == 1){
                    await EngineController.deleteK8SResource(data.node, data.ns, "podpreset", "ws-vcap");
                }
                await EngineController.applyK8SYaml(yamlTmpPath, data.ns, data.node);
                
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "update cluster pod presets"
                }));
            } catch (error) {
                throw error;
            } finally {
                OSController.rmrf(yamlTmpPath);
            }
        } catch (error) {
            console.log("ERROR =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "update cluster pod presets",
                data: data
            }));
        }
    }

    /**
     * deleteK8SService
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async deleteK8SService(topicSplit, ip, data) {
        try {
            let volume = null;
            if(data.service.dedicatedPvc && data.service.dedicatedPvc.length > 0){
                volume = await DBController.getVolume(data.service.volumeId);
            }
            // Delete helm service
            await EngineController.deleteHelmService(data.service.instanceName, data.service.namespace, data.node);   
            // Delete persistent volume claim
            if(data.service.dedicatedPvc && data.service.dedicatedPvc.length > 0){
                await EngineController.removePersistantVolumeClaim(data.service.dedicatedPvc, data.service.namespace, data.node);
                await EngineController.removePersistantVolume(data.service.dedicatedPv, data.service.namespace, data.node);  
                if(volume){       
                    let r = await EngineController.sshExec(data.node.ip, `rm -rf /mnt/${volume.name}-${volume.secret}/srv-${data.service.instanceName}`, true);
                    if(r.code != 0) {
                        console.log(r);
                        throw new Error("Could not delete service folder");
                    } 
                }
            }

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete service"
            }));
        } catch (error) {
            console.log("ERROR 10 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "delete service",
                data: data
            }));
        }
    }

    /**
     * deployK8SPersistantVolumeClaim
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async deployK8SPersistantVolumeClaim(topicSplit, ip, data) {
        try {
            let pvcTemplate = YAML.parse(fs.readFileSync(path.join(__dirname, "k8s_templates/pvc-local.yaml"), 'utf8'));

            pvcTemplate.metadata.name = `${data.pvcName}`;
            pvcTemplate.spec.selector.matchLabels.app = `${data.pvName}`;
            pvcTemplate.spec.resources.requests.storage = `${data.size}`;

            // console.log(YAML.stringify(pvcTemplate));
            let yamlTmpPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.workspaceId.toString(), data.node.hostname, `pvc.yml`);
            fs.writeFileSync(yamlTmpPath, YAML.stringify(pvcTemplate));
            await EngineController.applyK8SYaml(yamlTmpPath, data.ns, data.node);     
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy persistant volume claim",
                data: data
            }));
        } catch (error) {
            console.log("ERROR 3 =>", error);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume claim",
                data: data
            }));
        }
    }

    /**
     * removeK8SAllPvForVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async removeK8SAllPvForVolume(topicSplit, ip, data) {
        try {
            let r = await EngineController.sshExec(data.node.ip, `ls /mnt/${data.volume.name}-${data.volume.secret}`, true);
            if(r.code != 0) {
                console.log(r);
                throw new Error("Could not list folders");
            } 
            let volumeDirs = [];
            r.stdout.split("\n").forEach((line, i) => {
                volumeDirs = volumeDirs.concat(line.split(" ").filter(o => o.length > 0).map(o => o.trim()));
            });

            for(let i=0; i<volumeDirs.length; i++) {
                console.log("Removing PV =>", `${volumeDirs[i]}-pv`);
                if(data.ns && data.ns == "*") {
                    let allPvs = await EngineController.getK8SResources(data.node, "*", "pv");
                    for(let y=0; y<allPvs.length; y++) {
                        if(allPvs[y].NAME == `${volumeDirs[i]}-pv`){
                            await EngineController.removePersistantVolume(`${volumeDirs[i]}-pv`, allPvs[y].NAMESPACE ? allPvs[y].NAMESPACE : "default", data.node);
                        }
                    }
                } else {
                    await EngineController.removePersistantVolume(`${volumeDirs[i]}-pv`, data.ns, data.node);
                }
                await EngineController.sshExec(data.node.ip, `rm -rf /mnt/${data.volume.name}-${data.volume.secret}/${volumeDirs[i]}`, true);
            }

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "remove all pv for volume",
                data: data
            }));
        } catch (error) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "remove all pv for volume",
                data: data
            }));
        }
    }

    /**
     * removeK8SPersistantVolumeClaim
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async removeK8SPersistantVolumeClaim(topicSplit, ip, data) {
        try {
            await EngineController.removePersistantVolumeClaim(data.pvcName, data.ns, data.node);     
            
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "remove persistant volume claim",
                data: data
            }));
        } catch (error) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume claim",
                data: data
            }));
        }
    }

    /**
     * removeK8SPersistantVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async removeK8SPersistantVolume(topicSplit, ip, data) {
        try {
            await EngineController.removePersistantVolume(data.pvName, data.ns, data.node);     
            let r = await EngineController.sshExec(data.node.ip, `rm -rf /mnt/${data.volume.name}-${data.volume.secret}/${data.subFolderName}`, true);
            if(r.code != 0) {
                console.log(r);
                throw new Error("Could not delete folders");
            } 
           
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "remove persistant volume",
                data: data
            }));
        } catch (error) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume",
                data: data
            }));
        }
    }

    /**
     * detatch_worker
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async detatch_worker(topicSplit, payload) {
        try {
            await EngineController.detatchWorker(payload.masterNode, payload.workerNode);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "detatch",
                nodeType: "worker",
                node: payload.workerNode
            }));
        } catch (err) {
            console.log(err);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "detatch",
                nodeType: "worker",
                node: payload.workerNode
            }));
        }
    }

    /**
     * deprovision_worker
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async deprovision_worker(topicSplit, payload) {
        try {
            let exists = await EngineController.vmExists(payload.workerNode.hostname);
            if(exists){
                await EngineController.stopDeleteVm(payload.workerNode.hostname, payload.workerNode.workspaceId);

                this.mqttController.client.publish(`/mycloud/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                    leasedIp: payload.workerNode.ip
                }));
                
                await DBController.deleteK8SWorkerNode(payload.workerNode.id);
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "deprovision",
                    nodeType: "worker",
                    node: payload.workerNode
                }));
            } else {
                this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 404,
                    task: "deprovision",
                    nodeType: "worker",
                    node: payload.workerNode
                }));
            }
        } catch (err) {
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "deprovision",
                nodeType: "worker",
                node: payload.workerNode
            }));
        }
    }

    /**
     * provision_worker
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async provision_worker(topicSplit, payload) {
        let result = null;
        let dbId = null;
        try {
            let org = await DBController.getOrgForWorkspace(payload.masterNode.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);

            result = await EngineController.deployWorker(topicSplit, payload, org.registryUser, rPass);
            dbId = await DBController.createK8SWorkerNode(result.nodeIp, result.nodeHostname, result.workspaceId, result.hostId, result.hash);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                hash: result.hash,
                task: "provision",
                nodeType: "worker",
                k8sNodeId: dbId
            }));
        } catch (err) {
            // The deploy finished, error occured during DB update. Need to roolback everything
            if(result){
                try{
                    let created = await EngineController.vmExists(`worker.${result.hash}`);
                    if(created){
                        await EngineController.stopDeleteVm(`worker.${result.hash}`, result.workspaceId);
                    }
                    
                    if(result.leasedIp){
                        this.mqttController.client.publish(`/mycloud/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                            leasedIp: result.leasedIp
                        }));
                    }
                } catch(_err) {
                    // TODO: Log rollback error
                    console.log(_err);
                }
            }
            if(dbId != null) {
                await DBController.deleteK8SWorkerNode(dbId);
            }

            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "provision",
                nodeType: "worker"
            }));
        }
    }

    /**
     * taint_master
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async taint_master(topicSplit, payload) {
        try {
            await EngineController.taintMaster(payload.masterNode);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "taintMaster",
                nodeType: "master",
                node: payload.masterNode
            }));
        } catch (err) {
            console.log(err);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "taintMaster",
                nodeType: "master",
                node: payload.masterNode
            }));
        }
    }

    /**
     * untaint_master
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async untaint_master(topicSplit, payload) {
        try {
            await EngineController.untaintMaster(payload.masterNode);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "untaintMaster",
                nodeType: "master",
                node: payload.masterNode
            }));
        } catch (err) {
            console.log(err);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "untaintMaster",
                nodeType: "master",
                node: payload.masterNode
            }));
        }
    }

    /**
     * grabConfigFile
     * @param {*} masterIp 
     * @param {*} workspaceId 
     */
    static async grabMasterConfigFile(topicSplit, masterIp, workspaceId) {
        try {
            let tmpConfigFilePath = await EngineController.grabMasterConfigFile(masterIp, workspaceId);
            let _b = fs.readFileSync(tmpConfigFilePath);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/api/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                config: _b.toString('base64')
            }));
            fs.unlinkSync(tmpConfigFilePath);
        } catch (err) {
            console.log(err);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "grabMasterConfigFile",
                nodeType: "master"
            }));
        }
    }

    /**
     * get_k8s_state
     * @param {*} topicSplit 
     * @param {*} masterNode 
     */
    static async get_k8s_state(topicSplit, masterNode) {
        try {
            let stateData = await EngineController.getK8SState(masterNode);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "getK8SState",
                nodeType: "master",
                state: stateData,
                node: masterNode
            }));
        } catch (err) {
            console.log(err);
            this.mqttController.client.publish(`/mycloud/k8s/host/respond/${this.parent.ip}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "getK8SState",
                nodeType: "master",
                node: masterNode
            }));
        }
    }
}
TaskRuntimeController.ip = null;
module.exports = TaskRuntimeController;