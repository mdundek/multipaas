const OSController = require("../os/index");
const DBController = require("../db/index");

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');

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

let _normalizeName = (base) => {
    base = base.replace(/[^a-z0-9+]+/gi, '-');
    return base;
}

class TaskRuntimeController {
    
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
     * requestCreateK8SResource
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestCreateK8SResource(topicSplit, data) {
        try{
            await this.kubectl(`kubectl create ${data.type} ${data.name}${data.ns ? " --namespace=" + data.ns : ""}`, data.node);
            if(data.type == "namespace") {
                let adminRoleBindingYamlPath = path.join(process.cwd(), "resources", "k8s_templates", "rbac_role_bindings.yaml");
                let wsTmpYamlPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `rbac_role_bindings.yaml`);
                await OSController.copyFile(adminRoleBindingYamlPath, path.dirname(wsTmpYamlPath));
                let adminRoleBindingYaml = YAML.parse(fs.readFileSync(wsTmpYamlPath, 'utf8'));
                adminRoleBindingYaml.kind = "RoleBinding";
                adminRoleBindingYaml.metadata.namespace = data.name;
                for(let i=0; i<data.groups.length; i++) {
                    if(data.groups[i].name != "cluster-admin") {
                        adminRoleBindingYaml.metadata.name = `mp-${data.name}-${data.groups[i].name}-binding`;
                        adminRoleBindingYaml.subjects[0].name = `/mp/${data.clusterBaseGroup}/${data.groups[i].name}`;
                        adminRoleBindingYaml.roleRef.name = data.groups[i].name;

                        fs.writeFileSync(wsTmpYamlPath, YAML.stringify(adminRoleBindingYaml));
                        await TaskRuntimeController.applyK8SYaml(wsTmpYamlPath, null, data.node);
                    }
                }
                await TaskRuntimeController.kubectl(`kubectl create secret docker-registry regcred --docker-server=${data.registry.server} --docker-username=${data.registry.username} --docker-password=${data.registry.password} --docker-email=${data.registry.email} --namespace=${data.name}`, data.node);
            }
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "create k8s resource"
            }));
        } catch (_error) {
            console.error(_error);
            try { await this.kubectl(`kubectl delete ${data.type} ${data.name}${data.ns ? " --namespace=" + data.ns : ""}`, data.node); } catch (error) {}
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message,
                task: "create k8s resource"
            }));
        }   
    }

    /**
     * requestGetK8sResources
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestGetK8sResources(topicSplit, ip, data) {
        try{
            let resourceResponses = {};
            for(let i=0; i<data.targets.length; i++) {
                let result = await this.getK8SResources(
                    data.node, 
                    data.ns, 
                    data.targets[i], 
                    (data.targetNames && data.targetNames.length >= (i+1)) ? data.targetNames[i] : null,
                    null,
                    data.json ? data.json : false
                );
                resourceResponses[data.targets[i]] = result
            }
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "get k8s resources",
                output: resourceResponses
            }));
        } catch (err) {
            console.log(err);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "get k8s resources",
                data: data
            }));
        }
    }

    /**
     * requestGetK8SResourceValues
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestGetK8SResourceValues(topicSplit, ip, data) {
        try{
            let result = await this.getK8SResourceValues(data.node, data.ns, data.target, data.targetName, data.jsonpath);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "get k8s resource values",
                output: result
            }));
        } catch (err) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "get k8s resource values",
                data: data
            }));
        }
    }

    /**
     * requestGetHelmDeployments
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestGetHelmDeployments(topicSplit, ip, data) {
        try{
            let result = await this.getHelmDeployments(data.node, data.ns);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "get helm deployments",
                output: result
            }));
        } catch (err) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "get helm deployments",
                data: data
            }));
        }
    }

    /**
     * requestGetK8sState
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestGetK8sState(topicSplit, data) {
        try {
            let stateData = await this.getK8SState(data.node);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "getK8SState",
                nodeType: "master",
                state: stateData,
                node: data.node
            }));
        } catch (err) {
            console.error(err);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "getK8SState",
                nodeType: "master",
                node: data.node
            }));
        }
    }

    /**
     * requestGrabMasterConfigFile
     * @param {*} masterIp 
     * @param {*} workspaceId 
     */
    static async requestGrabMasterConfigFile(topicSplit, data) {
        try {
            let tmpConfigFilePath = await this.grabMasterConfigFile(data.node.ip, data.node.workspaceId);
            let _b = fs.readFileSync(tmpConfigFilePath);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                config: _b.toString('base64')
            }));
            fs.unlinkSync(tmpConfigFilePath);
        } catch (err) {
            console.error(err);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "grabMasterConfigFile",
                nodeType: "master"
            }));
        }
    }

    /**
     * 
     * @param {*} topicSplit 
     * @param {*} data 
     */
    static async requestRollbackK8SConfigs(topicSplit, data) {
        // Restore what has been updated & delete new resources
        await this.rollbackK8SConfigs(data);
        this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
            status: 200,
            task: "rollback k8s resources",
            backupConfigs: data.backupConfigs
        }));
    }

    /**
     * requestUpdateClusterPodPresets
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestUpdateClusterPodPresets(topicSplit, data) {
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
                    NAME: data.allServices[i].name
                };
                if(data.allServices[i].externalServiceName && data.allServices[i].externalServiceName.length > 0){
                    SERVICE_VCAPS.DNS = `${data.allServices[i].externalServiceName}.${data.allServices[i].namespace}.svc.cluster.local`;
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
                            
                            let output = await this.getK8SResourceValues(data.node, data.ns, "secret", secretResolvedName, `{.data.${secretParamName}}`, true);   
                            if(output.length == 1 && output[0].length > 0){
                                SERVICE_VCAPS[envName] = output[0];
                            }
                        }
                    }
                }
                VCAPS[data.allServices[i].serviceName].push(SERVICE_VCAPS);
            }
          
            let ppTemplate = YAML.parse(fs.readFileSync(path.join(process.cwd(), "resources", "k8s_templates", "pod-preset.yaml"), 'utf8'));
            ppTemplate.spec.env[0].value = JSON.stringify(VCAPS);
          
            let yamlTmpPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `pp.yml`);
            fs.writeFileSync(yamlTmpPath, YAML.stringify(ppTemplate));
           
            try {
                let existingPp = await this.getK8SResources(data.node, data.ns, "podpreset", ["ws-vcap"]);   
                if(existingPp.length == 1){
                    await this.deleteK8SResource(data.node, data.ns, "podpreset", "ws-vcap");
                }
                await this.applyK8SYaml(yamlTmpPath, data.ns, data.node);
                
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "update cluster pod presets"
                }));
            } catch (error) {
                throw error;
            } finally {
                OSController.rmrf(yamlTmpPath);
            }
        } catch (error) {
            console.error(error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "update cluster pod presets",
                data: data
            }));
        }
    }

    /**
     * requestDeployK8SPersistantVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeployK8SPersistantVolume(topicSplit, ip, data) {
        try {
            let pvTemplate = YAML.parse(fs.readFileSync(path.join(process.cwd(), "resources", "k8s_templates", "pv-local.yaml"), 'utf8'));

            pvTemplate.metadata.name = data.pvName;
            pvTemplate.metadata.labels.app  = data.pvName;
            pvTemplate.metadata.labels.volumeHash = data.volume.secret;
            pvTemplate.spec.capacity.storage = `${data.size}Mi`;
            pvTemplate.spec.local.path = `/mnt/${data.volume.name}-${data.volume.secret}/${data.subFolderName}`;
            pvTemplate.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values = data.hostnames;
    
            let yamlTmpPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.workspaceId.toString(), data.node.hostname, `pv.yml`);
            fs.writeFileSync(yamlTmpPath, YAML.stringify(pvTemplate));

            let r = await OSController.sshExec(data.node.ip, `sudo mkdir -p ${pvTemplate.spec.local.path}`, true);
            if(r.code != 0) {
                console.error(r);
                throw new Error("Could not create folders");
            } 

            await this.applyK8SYaml(yamlTmpPath, data.ns, data.node);     
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
     * requestDeployK8SPersistantVolumeClaim
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeployK8SPersistantVolumeClaim(topicSplit, ip, data) {
        try {
            let pvcTemplate = YAML.parse(fs.readFileSync(path.join(process.cwd(), "resources", "k8s_templates", "pvc-local.yaml"), 'utf8'));

            pvcTemplate.metadata.name = `${data.pvcName}`;
            pvcTemplate.spec.selector.matchLabels.app = `${data.pvName}`;
            pvcTemplate.metadata.labels.volumeHash = data.volume.secret;
            pvcTemplate.spec.resources.requests.storage = `${data.size}`;

            let yamlTmpPath = path.join(process.env.VM_BASE_DIR, "workplaces", data.workspaceId.toString(), data.node.hostname, `pvc.yml`);
            fs.writeFileSync(yamlTmpPath, YAML.stringify(pvcTemplate));
            await this.applyK8SYaml(yamlTmpPath, data.ns, data.node);     
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "deploy persistant volume claim",
                data: data
            }));
        } catch (error) {
            console.error(error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume claim",
                data: data
            }));
        }
    }

    /**
     * requestRemoveK8SAllPvForVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestRemoveK8SAllPvForVolume(topicSplit, ip, data) {
        try {
            let r = await OSController.sshExec(data.node.ip, `sudo ls /mnt/${data.volume.name}-${data.volume.secret}`, true);
            if(r.code != 0) {
                console.error(r);
                throw new Error("Could not list folders");
            } 
            let volumeDirs = [];
            r.stdout.split("\n").forEach((line, i) => {
                volumeDirs = volumeDirs.concat(line.split(" ").filter(o => o.length > 0).map(o => o.trim()));
            });

            for(let i=0; i<volumeDirs.length; i++) {
                if(data.ns && data.ns == "*") {
                    let allPvs = await this.getK8SResources(data.node, "*", "pv");
                    for(let y=0; y<allPvs.length; y++) {
                        if(allPvs[y].NAME == `${volumeDirs[i]}-pv`){
                            await this.removePersistantVolume(`${volumeDirs[i]}-pv`, allPvs[y].NAMESPACE ? allPvs[y].NAMESPACE : "default", data.node);
                        }
                    }
                } else {
                    await this.removePersistantVolume(`${volumeDirs[i]}-pv`, data.ns, data.node);
                }
                await OSController.sshExec(data.node.ip, `sudo rm -rf /mnt/${data.volume.name}-${data.volume.secret}/${volumeDirs[i]}`, true);
            }

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "remove all pv for volume",
                data: data
            }));
        } catch (error) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "remove all pv for volume",
                data: data
            }));
        }
    }

    /**
     * 
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestTriggerDeploymentStaustEvents(topicSplit, ip, data) {
        try {
            let resultD = await this.getK8SDeploymentStatus(data.node);
            let resultS = await this.getK8SStatefulsetsStatus(data.node);
            resultD.forEach(line => {
                this.mqttController.client.publish(`/multipaas/cluster/event/${data.node.hostname}`, `D:${line}`);
            });
            resultS.forEach(line => {
                this.mqttController.client.publish(`/multipaas/cluster/event/${data.node.hostname}`, `S:${line}`);
            });
        } catch (error) {
            console.error(error);
        }
    }
    
    /**
     * requestRemoveK8SPersistantVolumeClaim
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestRemoveK8SPersistantVolumeClaim(topicSplit, ip, data) {
        try {
            await this.removePersistantVolumeClaim(data.pvcName, data.ns, data.node);     
            
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "remove persistant volume claim",
                data: data
            }));
        } catch (error) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume claim",
                data: data
            }));
        }
    }

    /**
     * requestRemoveK8SPersistantVolume
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestRemoveK8SPersistantVolume(topicSplit, ip, data) {
        try {
            await this.removePersistantVolume(data.pvName, data.ns, data.node);     
            let r = await OSController.sshExec(data.node.ip, `sudo rm -rf /mnt/${data.volume.name}-${data.volume.secret}/${data.subFolderName}`, true);
            if(r.code != 0) {
                console.error(r);
                throw new Error("Could not delete folders");
            } 
           
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "remove persistant volume",
                data: data
            }));
        } catch (error) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: error.code ? error.code : 500,
                message: error.message,
                task: "deploy persistant volume",
                data: data
            }));
        }
    }

    /**
     * grabConfigFile
     * @param {*} masterIp 
     * @param {*} workspaceId 
     */
    static async grabMasterConfigFile(masterIp, workspaceId) {
        let hash = null;
        while(hash == null){
            hash = shortid.generate().toLowerCase();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
        }
        let tmpFileName = path.join(process.env.VM_BASE_DIR, "workplaces", workspaceId.toString(), `${hash}.conf`);
        await OSController.fetchFileSsh(masterIp, tmpFileName, '/etc/kubernetes/admin.conf');

        return tmpFileName;
    }

    /**
     * deleteK8SResource
     * @param {*} masterNode 
     * @param {*} resource 
     * @param {*} name 
     */
    static async deleteK8SResource(masterNode, ns, resource, name) {
        await OSController.sshExec(masterNode.ip, `kubectl delete ${resource} ${name}${ns ? " --namespace=" + ns : ""}`, true, true);
    }

    /**
     * detatchWorker
     * @param {*} masterNode 
     * @param {*} workerNode 
     */
    static async detatchWorker(masterNode, workerNode) {
        await OSController.sshExec(masterNode.ip, `kubectl drain ${workerNode.hostname} --ignore-daemonsets --delete-local-data`);
        await OSController.sshExec(masterNode.ip, `kubectl delete node ${workerNode.hostname}`);
    }

    /**
     * taintMaster
     * @param {*} masterNode 
     */
    static async taintMaster(masterNode) {
        await OSController.sshExec(masterNode.ip, `kubectl taint nodes ${masterNode.hostname} ${masterNode.hostname}=DoNotSchedulePods:NoExecute`);
    }

    /**
     * untaintMaster
     * @param {*} masterNode
     */
    static async untaintMaster(masterNode) {
        await OSController.sshExec(masterNode.ip, `kubectl taint nodes ${masterNode.hostname} ${masterNode.hostname}:NoExecute-`);
    }

    /**
     * getK8SResources
     * @param {*} masterNode 
     * @param {*} resourceName 
     */
    static async getK8SResources(masterNode, ns, resourceName, resourceLabels, labels, jsonOutput) {
        let nsString = "";
        if(ns == "*"){
            nsString = " --all-namespaces";
        } else if(ns){
            nsString = " --namespace=" + ns;
        }
        let cmd = `kubectl get ${resourceName}`;
        if(resourceLabels) {
            cmd += ` ${resourceLabels.join(' ')}`;
        }

        if(labels) {
            cmd += ' -l ';
            for(let labelKey in labels) {
                cmd += `${labelKey}=${labels[labelKey]},`;
            }
            cmd = cmd.substring(0, cmd.length-1);
        }

        cmd = `${cmd}${nsString}${jsonOutput ? " -o=json":""}`;
        
        let r = await OSController.sshExec(masterNode.ip, cmd, true);
       
        if(r.code != 0) {
            if(resourceLabels && resourceLabels.length == 1 && r.stderr.indexOf("Error from server (NotFound):") != -1){
                return [];
            } else {
                console.error(r);
                throw new Error("Could not get resources on cluster");
            }
        } 

        if(jsonOutput){
            return JSON.parse(r.stdout);
        } else {
            if(r.stdout.toLowerCase().indexOf("no resources found") != -1){
                return [];
            }

            let responses = [];
            let headers = [];
            r.stdout.split("\n").forEach((line, i) => {
                if(i == 0) {
                    let _hNames = line.split("  ").filter(o => o.length > 0);
                    _hNames.forEach((n, z) => {
                        if(z == 0){
                            headers.push({"name": n.trim(), "pos": line.indexOf(`${n.trim()} `)});
                        } 
                        else if((z+1) == _hNames.length){
                            headers.push({"name": n.trim(), "pos": line.indexOf(` ${n.trim()}`)-1});
                        }
                        else {
                            headers.push({"name": n.trim(), "pos": line.indexOf(` ${n.trim()} `)-1});
                        }
                    });
                } else {
                    let pos = 0;
                    let lineData = {};
                    for(let y=0; y<headers.length; y++){
                        if(y+1 == headers.length){
                            lineData[headers[y].name] = line.substring(pos).trim();
                        } else {
                            lineData[headers[y].name] = line.substring(pos, headers[y+1].pos).trim();
                            pos = headers[y+1].pos;
                        }
                    }
                    responses.push(lineData);
                }
            });
            return responses;
        }
    }

    /**
     * getK8SResourceValues
     * @param {*} masterNode 
     * @param {*} ns 
     * @param {*} resourceName 
     * @param {*} resourceLabel 
     * @param {*} jsonPath 
     * @param {*} doBase64Decode 
     */
    static async getK8SResourceValues(masterNode, ns, resourceName, resourceLabel, jsonPath, doBase64Decode) {
        let nsString = "";
        if(ns == "*"){
            nsString = " --all-namespaces";
        } else if(ns){
            nsString = " --namespace=" + ns;
        }

        let cmd = `kubectl get ${resourceName} ${resourceLabel}${nsString} -o=jsonpath="${jsonPath}"${doBase64Decode ? " | base64 --decode":""}`;
        
        let r = await OSController.sshExec(masterNode.ip, cmd, true);
        if(r.code != 0) {
            console.error(r);
            throw new Error("Could not get resources on cluster");
        } 
        if(r.stdout.toLowerCase().indexOf("no resources found") != -1){
            return null;
        }

        return r.stdout.split("\n");
    }

    /**
     * getK8SDeploymentStatus
     * @param {*} masterNode 
     */
    static async getK8SDeploymentStatus(masterNode) {
        let cmd = `kubectl get deployments --all-namespaces -o wide`;
        
        let r = await OSController.sshExec(masterNode.ip, cmd, true);
        if(r.code != 0) {
            console.error(r);
            throw new Error("Could not get resources on cluster");
        } 
        if(r.stdout.toLowerCase().indexOf("no resources found") != -1){
            return null;
        }

        let result = r.stdout.split("\n");
        result.shift();
        return result;
    }

    /**
     * getK8SStatefulsetsStatus
     */
    static async getK8SStatefulsetsStatus(masterNode) {
        let cmd = `kubectl get statefulsets --all-namespaces -o wide`;
        
        let r = await OSController.sshExec(masterNode.ip, cmd, true);
        if(r.code != 0) {
            console.error(r);
            throw new Error("Could not get resources on cluster");
        } 
        if(r.stdout.toLowerCase().indexOf("no resources found") != -1){
            return null;
        }

        let result = r.stdout.split("\n");
        result.shift();
        return result;
    }

    /**
     * getCurrentResourceJson
     * @param {*} masterNode 
     * @param {*} ns 
     * @param {*} resourceName 
     * @param {*} resourceLabel 
     */
    static async getCurrentResourceJson(masterNode, ns, resourceName, resourceLabel) {
        let nsString = "";
        if(ns == "*"){
            nsString = " --all-namespaces";
        } else if(ns){
            nsString = " --namespace=" + ns;
        }
        let cmd = `kubectl get ${resourceName} ${resourceLabel}${nsString} -o=json`;
      
        
        let r = await OSController.sshExec(masterNode.ip, cmd, true);
        if(r.code != 0) {
            return null;
        } 
        if(r.stdout.toLowerCase().indexOf("no resources found") != -1){
            return null;
        }

        let config = JSON.parse(r.stdout);
        if(config.metadata && config.metadata.annotations && config.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"]) {
            config = JSON.parse(config.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"]);
        } else if(config.metadata) {
            delete config.metadata.managedFields;
            delete config.metadata.generation;
            delete config.metadata.resourceVersion;
            delete config.metadata.selfLink;
            delete config.metadata.uid;
            delete config.metadata.creationTimestamp;
            if(config.metadata.annotations && Object.keys(config.metadata.annotations).length == 0){
                delete config.metadata.annotations;
            }
        }

        return config;
    }

    /**
     * getHelmDeployments
     * @param {*} masterNode 
     * @param {*} ns 
     */
    static async getHelmDeployments(masterNode, ns) {
        let nsString = "";
        if(ns == "*"){
            nsString = " --all-namespaces";
        } else if(ns){
            nsString = " --namespace " + ns;
        }

        let cmd = `helm ls${nsString} -a -o=json`;
        
        let r = await OSController.sshExec(masterNode.ip, cmd, true);
        if(r.code != 0) {
            console.error(r);
            throw new Error("Could not get helm deployments from cluster");
        } 
        return JSON.parse(r.stdout);
    }

    /**
     * applyK8SYaml
     * @param {*} yamlFilePath 
     * @param {*} node 
     */
    static async applyK8SYaml(yamlFilePath, ns, node) {
        let targetPath = null;
        try {
            if(process.env.MP_MODE != "unipaas") {
                targetPath = "/root";
                await OSController.pushFileSsh(node.ip, yamlFilePath, `${targetPath}/${path.basename(yamlFilePath)}`);
            } else {
                targetPath = path.join(process.env.VM_BASE_DIR, "workplaces", node.workspaceId.toString(), node.hostname);
                await OSController.copyFile(yamlFilePath, `${targetPath}/${path.basename(yamlFilePath)}`);
            }

            // Wait untill kubectl answers for 100 seconds max
            let attempts = 0;
            let success = false;
            while(!success && attempts <= 30){
                await _sleep(1000 * 5);
                
                let r = await OSController.sshExec(node.ip, `kubectl apply -f ${targetPath}/${path.basename(yamlFilePath)}${ns ? " --namespace=" + ns:""}`, true);
                if(r.code == 0) {
                    success = true;
                } else {
                    if(r.stderr.indexOf("6443 was refused") != -1 || r.stderr.indexOf("handshake timeout") != -1){
                        attempts++;
                    } else {
                        attempts = 31; // Jump out of loop
                    }            
                }
            }
            if(!success){
                throw new Error("Could not apply yaml resource on cluster");
            }
        } finally {
            await OSController.sshExec(node.ip, `rm -rf ${targetPath}/${path.basename(yamlFilePath)}`, true);
        }
    }

    /**
     * kubectl
     * @param {*} command 
     * @param {*} node 
     */
    static async kubectl(command, node, ignoreError) {
        console.log(command);
        // Wait untill kubectl answers for 100 seconds max
        let attempts = 0;
        let success = false;
        while(!success && attempts <= 30){
            let r = await OSController.sshExec(node.ip, command, true);
            if(r.code == 0) {
                success = true;
            } else {
                if(r.stderr.indexOf("6443 was refused") != -1){
                    attempts++;
                } else {
                    attempts = 31; // Jump out of loop
                } 
                await _sleep(1000 * 5);         
            }
        }
        if(!success && !ignoreError){
            throw new Error("Could not execute command: " + command);
        }
    }

    /**
     * removePersistantVolume
     * @param {*} pvName 
     * @param {*} node 
     */
    static async removePersistantVolume(pvName, ns, node, ignoreErrors) {
        try {
            await OSController.waitUntilUp(node.ip);
            let r = await OSController.sshExec(node.ip, `kubectl get pv ${pvName}${ns ? " --namespace="+ns : ""}`, true);
            if(!ignoreErrors && r.code != 0) {
                console.error(r);
                throw new Error("Could not delete PV on cluster");
            } 
            if(r.code == 0 && r.stdout.toLowerCase().indexOf("no resources found") == -1){
                await this.kubectl(`kubectl patch pv ${pvName}${ns ? " --namespace="+ns : ""} -p '{"metadata": {"finalizers": null}}'`, node);
                await this.kubectl(`kubectl delete pv ${pvName}${ns ? " --namespace="+ns : ""} --grace-period=0 --force`, node);
            }
        } catch (error) {
            console.error(JSON.stringify(error, null, 4));
            throw new Error("Could not delete PV on cluster");
        }
    }

    /**
     * removePersistantVolumeClaim
     * @param {*} pvcName 
     * @param {*} node 
     */
    static async removePersistantVolumeClaim(pvcName, ns, node) {
        try {
            await OSController.waitUntilUp(node.ip);
            let r = await OSController.sshExec(node.ip, `kubectl get pvc ${pvcName}${ns ? " --namespace=" + ns:""}`, true);
            if(r.code != 0) {
                throw new Error("Could not delete PVC on cluster");
            } 
            if(r.stdout.toLowerCase().indexOf("no resources found") == -1){
                await this.kubectl(`kubectl delete pvc ${pvcName}${ns ? " --namespace=" + ns:""}`, node);
            }            
        } catch (error) {
            console.error(JSON.stringify(error, null, 4));
            throw new Error("Could not delete PVC on cluster");
        }
    }

    /**
     * getK8SState
     * @param {*} masterNode 
     */
    static async getK8SState(masterNode) {
        let nodeStates = await OSController.sshExec(masterNode.ip, `kubectl get nodes -o wide`);
        let lines = nodeStates.split("\n");
        lines.shift();
        return lines.map(l => {
            return (l.split(" ").filter(o => o.length > 0).map(o => o.replace("\r", "")));
        }).map(lArray => {
            return {
                "name": lArray[0],
                "type": (lArray[2].toLowerCase() == "master" ? "master" : "worker"),
                "state": lArray[1],
                "ip": lArray[5]
            }
        });
    }

    /**
     * rollbackK8SConfigs
     * @param {*} data 
     */
    static async rollbackK8SConfigs(data) {
        // Restore what has been updated & delete new resources
        for(let i=0; i<data.backupConfigs.length; i++) {
            try { 
                let tmpFileName = null;
                while(tmpFileName == null){
                    tmpFileName = shortid.generate();
                    if(tmpFileName.indexOf("$") != -1 || tmpFileName.indexOf("@") != -1){
                        tmpFileName = null;
                    }
                }
                let backupFilePath = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, `${tmpFileName}.yaml`);
                fs.writeFileSync(backupFilePath, YAML.stringify(data.backupConfigs[i]));
                if(data.backupConfigs[i].metadata.namespace) {
                    await this.applyK8SYaml(backupFilePath, data.backupConfigs[i].metadata.namespace, data.node); 
                } else {
                    await this.applyK8SYaml(backupFilePath, data.ns, data.node); 
                }
            } catch (_e) {}
        }
        for(let i=0; i<data.newConfigs.length; i++) {
            try { 
                if(data.newConfigs[i].metadata.namespace) {
                    await this.kubectl(`kubectl delete ${data.newConfigs[i].kind} ${data.newConfigs[i].metadata.name} --namespace=${data.newConfigs[i].metadata.namespace}`, data.node);
                } else {
                    await this.kubectl(`kubectl delete ${data.newConfigs[i].kind} ${data.newConfigs[i].metadata.name} --namespace=${data.ns}`, data.node);
                }
            } catch (_e) {}
        }
    }
}
TaskRuntimeController.ip = null;
module.exports = TaskRuntimeController;