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
const mkdirp = require('mkdirp');
const _ = require("lodash");
const extract = require('extract-zip');

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

let _normalizeName = (base) => {
    base = base.replace(/[^a-z0-9+]+/gi, '-');
    return base;
}

// const ssh = new node_ssh();
let EngineController;

class TaskAppsController {
    
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
     * _unzip
     * @param {*} zipFile 
     * @param {*} targetDir 
     */
    static _unzip(zipFile, targetDir) {
        return new Promise((resolve, reject) => {
            extract(zipFile, {dir: targetDir}, function (err) {
                if(err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    /**
     * requestBuildPublishImage
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestBuildPublishImage(topicSplit, data) {
        let tmpZipFile = null;
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);
            let acc = await DBController.getAccountForOrg(org.id);
            
            this.mqttController.logEvent(data.socketId, "info", "Preparing build artefacts");

            let response = await this.mqttController.queryRequestResponse("api", "get_app_source_zip", {
                "zipPath": data.zipPath,
                "delete": true
            }, 1000 * 60 * 5);
            if(response.data.status != 200){
                this.mqttController.logEvent(data.socketId, "error", "An error occured while getching image files");
                throw new Error("Could not get app source zip file");
            }  
           
            tmpZipFile = path.join(require('os').homedir(), ".multipaas", path.basename(data.zipPath));
            await OSController.writeBinaryToFile(tmpZipFile, response.data.data);

            // this.mqttController.logEvent(data.socketId, "info", "Building image");
            await this.buildAndPushAppImage(data.node, tmpZipFile, data.imageName, data.imageVersion, org.name, acc.name, org.registryUser, rPass, (log, err) => {
                if(log){
                    this.mqttController.logEvent(data.socketId, "info", log);
                } else if(err) {
                    console.log("ERROR 1");
                    this.mqttController.logEvent(data.socketId, "error", err);
                }
            });

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "build image"
            }));

            // curl -k -X GET https://registry_user:registry_pass@192.168.0.98:5000/v2/_catalog
            // curl -k -X GET https://registry_user:registry_pass@192.168.0.98:5000/v2/oasis/sdfgsdfg/tags/list 
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "build image"
            }));
        } finally {
            if(fs.existsSync(tmpZipFile)){
                OSController.rmrf(tmpZipFile);
            }
        }
    }

    /**
     * requestGetOrgRegistryImages
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestGetOrgRegistryImages(topicSplit, data) {
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);
            let acc = await DBController.getAccountForOrg(org.id);
            
            let r = await this.getRegistryImages(data.node, org.name, acc.name, org.registryUser, rPass);
           
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "list images",
                output: r
            }));
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "list images"
            }));
        }
    }

    /**
     * requestDeleteRegistryImages
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestDeleteRegistryImages(topicSplit, data) {
        try {
            let org = await DBController.getOrgForWorkspace(data.node.workspaceId);
            let rPass = this.parent.decrypt(org.registryPass, org.bcryptSalt);
            
            await this.deleteRegistryImage(data.node, data.imageName, data.imageTag, org.registryUser, rPass);
           
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete images"
            }));
        } catch (error) {
            console.log("ERROR 9 =>", error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "delete images"
            }));
        }
    }

    /**
     * buildAndPushAppImage
     * @param {*} node 
     * @param {*} zipPath 
     */
    static async buildAndPushAppImage(node, tmpZipFile, imageName, imageVersion, orgName, accountName, rUser, rPass, cb) {
        // Prepare paths
        let folderName = path.basename(tmpZipFile);
        folderName = folderName.substring(0, folderName.lastIndexOf("."));
        let zipPath = path.join("/root", path.basename(tmpZipFile));
        let folderPath = path.join(path.join("/root", folderName));
       
        await OSController.pushFileSsh(node.ip, tmpZipFile, zipPath);

        await OSController.sshExec(node.ip, `printf "${rPass}" | docker login registry.multipaas.org --username ${rUser} --password-stdin`);

        let buildDone = false;
        try {
            let outputArray = await OSController.sshExec(node.ip, [
                `mkdir -p ${folderPath}`,
                `unzip ${zipPath} -d ${folderPath}`
            ]);
            let error = outputArray.find(o => o.code != 0);
            if(error){
                throw new Error(error.stderr);
            }
            await OSController.feedbackSshExec(node.ip, `docker build -t ${imageName}:${imageVersion} ${folderPath}`, cb);
            buildDone = true;
            await OSController.feedbackSshExec(node.ip, `docker tag ${imageName}:${imageVersion} registry.multipaas.org/${accountName}/${orgName}/${imageName}:${imageVersion}`, cb);
            await OSController.feedbackSshExec(node.ip, `docker push registry.multipaas.org/${accountName}/${orgName}/${imageName}:${imageVersion}`, cb);
        } finally {
            try {
                if(buildDone){
                    await OSController.sshExec(node.ip, 
                        `docker image rm registry.multipaas.org/${accountName}/${orgName}/${imageName}:${imageVersion}`
                    );
                }
                await OSController.sshExec(node.ip, `rm -rf ${folderPath}`);
                await OSController.sshExec(node.ip, `rm -rf ${zipPath}`);
            } catch (_e) {}
        }
    }

    /**
     * deleteRegistryImage
     * @param {*} node 
     * @param {*} imageName 
     * @param {*} imageTag 
     * @param {*} rUser 
     * @param {*} rPass 
     */
    static async deleteRegistryImage(node, imageName, imageTag, rUser, rPass) {
        await OSController.sshExec(node.ip, `printf "${rPass}" | docker login registry.multipaas.org --username ${rUser} --password-stdin`);
        

        let etag = await OSController.sshExec(node.ip, `curl -k -sSL -I -H "Accept: application/vnd.docker.distribution.manifest.v2+json" "https://${encodeURIComponent(rUser)}:${encodeURIComponent(rPass)}@registry.multipaas.org/v2/${imageName}/manifests/${imageTag}" | awk '$1 == "Docker-Content-Digest:" { print $2 }' | tr -d $'\r'`, true);
        if(etag.code != 0){
            throw new Error("Could not delete image");
        }
        etag = etag.stdout;
        
        if(etag.indexOf("sha256:") != 0){
            throw new Error("Could not delete image");
        }

        let result = await OSController.sshExec(node.ip, `curl -k -v -sSL -H "Accept:application/vnd.docker.distribution.manifest.v2+json" -X DELETE "https://${encodeURIComponent(rUser)}:${encodeURIComponent(rPass)}@registry.multipaas.org/v2/${imageName}/manifests/${etag}"`, true);
        if(result.code != 0){
            throw new Error("Could not delete image");
        }

        await OSController.sshExec(process.env.REGISTRY_IP, `docker exec -t multipaas-registry bin/registry garbage-collect /etc/docker/registry/config.yml`, true);

        let tagsResponse = await OSController.sshExec(node.ip, `curl -k -X GET https://${encodeURIComponent(rUser)}:${encodeURIComponent(rPass)}@registry.multipaas.org/v2/${imageName}/tags/list`);
        tagsResponse = JSON.parse(tagsResponse);
        if(tagsResponse.tags == null || tagsResponse.tags.length == 0) {
            await OSController.sshExec(process.env.REGISTRY_IP, `docker exec -t --privileged multipaas-registry rm -rf /var/lib/registry/docker/registry/v2/repositories/${imageName}`, true);
        }
    }

    /**
     * getRegistryImages
     * @param {*} node 
     * @param {*} orgName 
     * @param {*} accountName 
     * @param {*} rUser 
     * @param {*} rPass 
     */
    static async getRegistryImages(node, orgName, accountName, rUser, rPass) {
        await OSController.sshExec(node.ip, `printf "${rPass}" | docker login registry.multipaas.org --username ${rUser} --password-stdin`);
        let result = await OSController.sshExec(node.ip, `curl -k -X GET https://${encodeURIComponent(rUser)}:${encodeURIComponent(rPass)}@registry.multipaas.org/v2/_catalog`);
        console.log(result);
        result = JSON.parse(result);
        let repos = result.repositories.filter(o => o.indexOf(`${accountName}/${orgName}/`) == 0);
        let tagCommands = repos.map(o => `curl -k -X GET https://${encodeURIComponent(rUser)}:${encodeURIComponent(rPass)}@registry.multipaas.org/v2/${o}/tags/list`);
        let allTags = await OSController.sshExec(node.ip, tagCommands, true, true);
        allTags = allTags.map(o => JSON.parse(o.stdout));
        return allTags.map(o => {
            o.registry = "registry.multipaas.org";
            return o;
        });
    }

    /**
     * requestDeployNewApp
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestDeployNewApp(topicSplit, data) {
        let tmpFolderHash = null;
        while(tmpFolderHash == null){
            tmpFolderHash = shortid.generate();
            if(tmpFolderHash.indexOf("$") != -1 || tmpFolderHash.indexOf("@") != -1){
                tmpFolderHash = null;
            }
        }
        
        let chartTmpFolder = path.join(process.env.VM_BASE_DIR, "workplaces", data.deployParams.workspaceId.toString(), data.node.hostname, tmpFolderHash);
        try {
            let binaryFileName = "multipaas-app-0.0.1.tgz";

            let response = await this.mqttController.queryRequestResponse("api", "get_app_chart_binary", {});
            if(response.data.status != 200){
                throw new Error("Could not get chart binary");
            }  
            
            let tarTmpPath = path.join(chartTmpFolder, binaryFileName);
            let tmp_working_dir = path.join(chartTmpFolder, "_decompressed");
            mkdirp.sync(tmp_working_dir);
            tarTmpPath = path.join(tmp_working_dir, binaryFileName);
            
            await OSController.writeBinaryToFile(tarTmpPath, response.data.data);
            await OSController.untar(tarTmpPath, true);

            let deploymentName = _normalizeName(`${data.deployParams.name}-${data.deployParams.tag}`);

            let configOverwrite = {
                replicaCount: data.deployParams.replicaCount,
                nameOverride: data.deployParams.name,
                fullnameOverride: deploymentName,
                image: {
                    registry: data.deployParams.registry,
                    repository: data.deployParams.repository,
                    tag: data.deployParams.tag,
                    pullPolicy: "IfNotPresent"
                },
                ports: {
                    declare: false,
                    portReferences: []
                },
                envs: {
                    declare: false,
                    envReferences: []
                },
                pvc: {
                    claim: false,
                    pvcReferences: []
                },
                service: {
                    declare: false,
                    type: "ClusterIP",
                    portReferences: []
                }
            };

            if(data.deployParams.registry == "registry.multipaas.org") {
                configOverwrite.imagePullSecretsEnabled = true;
            }

            if(data.deployParams.ports.length > 0) {
                configOverwrite.ports.declare = true;
                configOverwrite.ports.portReferences = data.deployParams.ports.map(p => {
                    return {
                        name: p.name,
                        containerPort: parseInt(p.containerPort),
                        protocol: p.protocol
                    };
                });
            }

            if(data.deployParams.exposeService) {
                configOverwrite.service.declare = true;
                configOverwrite.service.portReferences = data.deployParams.ports.map(p => {
                    return {
                        port: parseInt(p.containerPort),
                        targetPort: p.name,
                        protocol: p.protocol,
                        name: p.name
                    };
                });
            }

            if(data.deployParams.envs.length > 0) {
                configOverwrite.envs.declare = true;
                configOverwrite.envs.envReferences = data.deployParams.envs.map(e => {
                    return {
                        name: e.name,
                        value: e.value
                    };
                });
            }

            if(data.deployParams.pvc.length > 0) {
                configOverwrite.pvc.claim = true;
                configOverwrite.pvc.pvcReferences = data.deployParams.pvc.map(pvc => {
                    return {
                        name: pvc.name,
                        mounts: pvc.mounts
                    };
                });
            }

            // Modify chart
            let valuesFilePath = path.join(tmp_working_dir, "values.yaml");
            let serviceValues = YAML.parse(fs.readFileSync(valuesFilePath, 'utf8'));
            const _serviceValues = _.merge(serviceValues, configOverwrite);
            fs.writeFileSync(valuesFilePath, YAML.stringify(_serviceValues));

            let chartFilePath = path.join(tmp_working_dir, "Chart.yaml");
            let chartValues = YAML.parse(fs.readFileSync(chartFilePath, 'utf8'));
            chartValues.appVersion = data.deployParams.tag;
            fs.writeFileSync(chartFilePath, YAML.stringify(chartValues));

            await OSController.rmrf(tarTmpPath);
            await OSController.tar(tmp_working_dir, tarTmpPath);
            
            let result = await this.deployHelmApp(deploymentName, data.deployParams.ns, null, data.node, tarTmpPath, deploymentName);   
            
            if(tmp_working_dir){
                await rmfr(tmp_working_dir);
            }

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy app",
                data: result
            }));
        } catch (error) {
            console.log("ERROR 10 =>", error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy app"
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
    static async requestDeleteK8SApplicationVersion(topicSplit, ip, data) {
        try {
            let deploymentName = _normalizeName(`${data.application.name}-${data.applicationVersion.tag}`);
            // Delete helm app
            let r = await OSController.sshExec(data.node.ip, `helm uninstall ${deploymentName}${data.application.namespace ? " --namespace " + data.application.namespace:""}`, true);
            if(r.code != 0) {
                console.log(JSON.stringify(r, null, 4));
                throw new Error("Could not uninstall helm service instance");
            }

            // If no more versions present, we delete ingress roules for this app
            let applicationVersions = await DBController.getApplicationVersionsForWs(data.application.workspaceId);
            // console.log(JSON.stringify(data, null, 4));
            // console.log(JSON.stringify(applicationVersions, null, 4));
            let remainingAppVersions = applicationVersions.filter(version => version.applicationId == data.application.id && version.id != data.applicationVersion.id);
            // console.log(JSON.stringify(remainingAppVersions, null, 4));
            if(remainingAppVersions.length == 0) {
                await TaskIngressController.cleanupIngressRulesForApplications(data.application, data.node, true);
            } 
            
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete application"
            }));
        } catch (error) {
            console.log("ERROR 10 =>", error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "delete application",
                data: data
            }));
        }
    }

    /**
     * requestScaleApplicationVersion
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestScaleApplicationVersion(topicSplit, ip, data) {
        try {
            // Scale app
            let r = await OSController.sshExec(data.node.ip, `kubectl scale --replicas=${data.replicaCount} deployment ${data.deployment} -n ${data.ns}`, true);
            if(r.code != 0) {
                console.log(JSON.stringify(r, null, 4));
                throw new Error("Could not scale application version");
            }
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "scale application"
            }));
        } catch (error) {
            console.log(error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "scale application",
                data: data
            }));
        }
    }
    
    /**
     * deployHelmApp
     * @param {*} serviceName 
     * @param {*} helmParams 
     * @param {*} node 
     * @param {*} chartTarFilePath 
     * @param {*} clusterIPServiceName 
     */
    static async deployHelmApp(serviceName, ns, helmParams, node, chartTarFilePath, clusterIPServiceName) {
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

        let helmChartTargetPath = `/root/${path.basename(chartTarFilePath)}`;
        await OSController.pushFileSsh(node.ip, chartTarFilePath, helmChartTargetPath);
        await _sleep(1000);

        // Execute HELM command
        // let helmCmd = `helm install ${pString}--output yaml${ns ? " --namespace " + ns : ""} ${serviceName} ${helmChartTargetPath}`;
        let helmCmd = `helm install --atomic ${pString}--output yaml${ns ? " --namespace " + ns : ""} ${serviceName} ${helmChartTargetPath}`;
        let r = await OSController.sshExec(node.ip, helmCmd, true);

        await _sleep(2000);
        await OSController.sshExec(node.ip, `rm -rf ${helmChartTargetPath}`, true);

        if(r.code != 0) {
            console.log(JSON.stringify(r, null, 4));
            throw new Error("Could not deploy app");
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
            console.log(error);
            await OSController.sshExec(node.ip, `helm uninstall ${serviceName}${ns ? " --namespace " + ns : ""}`, true);
            throw error;
        }

        return output;
    }
}
TaskAppsController.ip = null;
module.exports = TaskAppsController;