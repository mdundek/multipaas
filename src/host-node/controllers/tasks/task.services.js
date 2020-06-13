const TaskRuntimeController = require('./task.runtime');
const TaskIngressController = require('./task.ingress');

const OSController = require("../os/index");
const DBController = require("../db/index");

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');
const rmfr = require('rmfr');
const _ = require("lodash");
const mkdirp = require('mkdirp');

// const ssh = new node_ssh();
let EngineController;

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

class TaskServicesController {
    
    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;

        // Prepare the environment scripts
        if(process.env.CLUSTER_ENGINE == "virtualbox") {
            EngineController = require("../engines/virtualbox/index");
        }
    }

    /**
     * createServicePvDir
     * @param topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestCreateServicePvDir(topicSplit, ip, data) {
        try {
            let r = await OSController.sshExec(data.node.ip, `mkdir -p /mnt/${data.volume.name}-${data.volume.secret}/${data.subFolderName}`, true);
            if(r.code != 0) {
                console.error(r);
                throw new Error("Could not create folders");
            } 
    
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy persistant volume",
                data: data
            }));
        } catch (error) {
            console.error(error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
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
    static async requestDeployK8SService(topicSplit, ip, data) {
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
            
            let result = await this.deployHelmService(data.serviceInstanceName, data.ns, data.serviceParams, data.node, tarTmpPath, data.clusterIPServiceName);   
            
            if(tmp_working_dir){
                await rmfr(tmp_working_dir);
            }
            
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy service",
                data: result
            }));
        } catch (error) {
            console.error(error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy service"
            }));
        } finally {
            OSController.rmrf(chartTmpFolder);
        }
    }

    /**
     * deleteK8SService
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeleteK8SService(topicSplit, ip, data) {
        try {
            let volume = null;
            if(data.service.dedicatedPvc && data.service.dedicatedPvc.length > 0){
                volume = await DBController.getVolume(data.service.volumeId);
            }
            // Delete helm service
            let r = await OSController.sshExec(data.node.ip, `helm uninstall ${data.service.instanceName}${data.service.namespace ? " --namespace " + data.service.namespace:""}`, true);
            if(r.code != 0) {
                console.error(JSON.stringify(r, null, 4));
                throw new Error("Could not uninstall helm service instance");
            }

            // Delete persistent volume claim
            if(data.service.dedicatedPvc && data.service.dedicatedPvc.length > 0){
                await TaskRuntimeController.removePersistantVolumeClaim(data.service.dedicatedPvc, data.service.namespace, data.node);
                await TaskRuntimeController.removePersistantVolume(data.service.dedicatedPv, data.service.namespace, data.node);  
                if(volume){       
                    let r = await OSController.sshExec(data.node.ip, `rm -rf /mnt/${volume.name}-${volume.secret}/srv-${data.service.instanceName}`, true);
                    if(r.code != 0) {
                        console.error(r);
                        throw new Error("Could not delete service folder");
                    } 
                }
            }

            // Update ingress resources
            await TaskIngressController.cleanupIngressRulesForServices(data.service, data.node);

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete service"
            }));
        } catch (error) {
            console.error(error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "delete service",
                data: data
            }));
        }
    }

    /**
     * deployHelmService
     * @param {*} serviceName 
     * @param {*} helmParams 
     * @param {*} node 
     * @param {*} chartTarFilePath 
     * @param {*} clusterIPServiceName 
     */
    static async deployHelmService(serviceName, ns, helmParams, node, chartTarFilePath, clusterIPServiceName) {
        // Build command or HELM
        let serviceParamStrings = [];
        if(helmParams){
            for(let p in helmParams){
                serviceParamStrings.push(`${p}=${helmParams[p]}`);
            }
        }

        let pString = "";
        if(serviceParamStrings.length > 0){
            pString = `--set ${serviceParamStrings.join(',')} `;
        }

        let helmChartTargetPath;
        let targetPath;
        if(process.env.MP_MODE != "unipaas") {
            targetPath = "/root";
            helmChartTargetPath = `${targetPath}/${path.basename(chartTarFilePath)}`;
            await OSController.pushFileSsh(node.ip, chartTarFilePath, helmChartTargetPath);
            await _sleep(1000);
        } else {
            targetPath = path.join(process.env.VM_BASE_DIR, "workplaces", node.workspaceId.toString(), node.hostname);
            helmChartTargetPath = `${targetPath}/${path.basename(chartTarFilePath)}`;
            await OSController.copyFile(chartTarFilePath, helmChartTargetPath);
            await _sleep(1000);
        }

        // Execute HELM command
        let helmCmd = `helm install --atomic ${pString}--output yaml${ns ? " --namespace " + ns : ""} ${serviceName} ${helmChartTargetPath}`;
        let r = await OSController.sshExec(node.ip, helmCmd, true);
        await _sleep(2000);
        await OSController.sshExec(node.ip, `rm -rf ${helmChartTargetPath}`, true);

        if(r.code != 0) {
            console.error(JSON.stringify(r, null, 4));
            throw new Error("Could not deploy service");
        }

        // Grab output and clean it up a bit
        let output = YAML.parse(r.stdout);
        delete output.chart.templates;
        delete output.chart.files;
        delete output.chart.schema;
        delete output.manifest;

        output.exposedPorts = [];
        try {
            let serviceObjs = await TaskRuntimeController.getK8SResources({ip: node.ip}, ns, "services", [clusterIPServiceName]);
            serviceObjs[0]["PORT(S)"].split(',').forEach(sp => {
                sp = sp.trim();
                let i = sp.indexOf(":");
                if(i != -1){
                   let map = {
                       "type": "NodePort",
                       "from": sp.substring(i+1),
                       "to": sp.substring(0, i)
                   };
                   map.from = map.from.substring(0, map.from.indexOf("/"));
                   output.exposedPorts.push(map);
                } else {
                    i = sp.indexOf("/");
                    output.exposedPorts.push({
                        "type": "ClusterIP",
                        "to": parseInt(sp.substring(0, i))
                    });
                }
            });

        } catch (error) {
            await OSController.sshExec(node.ip, `helm uninstall ${serviceName}${ns ? " --namespace " + ns : ""}`, true);
            throw error;
        }

        return output;
    }
}
TaskServicesController.ip = null;
module.exports = TaskServicesController;