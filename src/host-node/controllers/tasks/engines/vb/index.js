const OSController = require('../../../os/index');
const path = require('path');
const mkdirp = require('mkdirp');
const rmfr = require('rmfr');
const fs = require('fs');
const node_ssh = require('node-ssh');
const ping = require('ping');
const shortid = require('shortid');
const YAML = require('yaml');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

let portLetterMap = {
    1: 'b',
    2: 'c',
    3: 'd',
    4: 'e',
    5: 'f',
    6: 'g',
    7: 'h',
    8: 'i',
    9: 'j',
    10: 'k',
    11: 'l',
    12: 'm',
    13: 'n',
    14: 'o',
    15: 'p',
    16: 'q',
    17: 'r',
    18: 's',
    19: 't',
    20: 'u'
};

// Sleep promise for async
let _sleep = (duration) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

class EngineController {

    /**
     * init
     */
    static async init(mqttController) {
        this.mqttController = mqttController;

        this.ip = await OSController.getIp();

        let targetBootstrapK8STemplatesDir = path.join(process.env.VM_BASE_DIR, "deployment_templates");
        let targetBootstrapK8SIngress = path.join(targetBootstrapK8STemplatesDir, "ingress-controller");
        if (fs.existsSync(targetBootstrapK8SIngress)) {
            await rmfr(targetBootstrapK8SIngress);
        }
        mkdirp.sync(targetBootstrapK8SIngress);
        await OSController.copyDir(path.join("controllers", "tasks", "k8s_templates", "ingress-controller"), targetBootstrapK8SIngress);

        let targetBootstrapScriptBaseDir = path.join(process.env.VM_BASE_DIR, "bootstrap_scripts");
        let targetBootstrapK8SFolder = path.join(targetBootstrapScriptBaseDir, "k8s");

        if (fs.existsSync(targetBootstrapK8SFolder)) {
            await rmfr(targetBootstrapK8SFolder);
        }
        mkdirp.sync(targetBootstrapK8SFolder);

        await OSController.copyDir(path.join("controllers", "tasks", "scripts", "bootstrap_k8s"), targetBootstrapK8SFolder);
        await OSController.chmodr(targetBootstrapScriptBaseDir, 0o755);

        let targetProvisioningScriptBaseDir = path.join(process.env.VM_BASE_DIR, "provisioning_scripts");
        let targetProvisioningK8SScriptFolder = path.join(targetProvisioningScriptBaseDir, "k8s");

        if (fs.existsSync(targetProvisioningK8SScriptFolder)) {
            await rmfr(targetProvisioningK8SScriptFolder);
        }
        mkdirp.sync(targetProvisioningK8SScriptFolder);

        OSController.copyFile(path.join("controllers", "tasks", "scripts", "deploy_master.sh"), targetProvisioningK8SScriptFolder);
        OSController.copyFile(path.join("controllers", "tasks", "scripts", "deploy_worker.sh"), targetProvisioningK8SScriptFolder);
        OSController.copyFile(path.join("controllers", "tasks", "scripts", "get_ip_hostname.sh"), targetProvisioningK8SScriptFolder);
        await OSController.chmodr(targetProvisioningScriptBaseDir, 0o755); 
    }

    /**
     * takeSnapshot
     * @param {*} node 
     */
    static async takeSnapshot(node) {
        let hash = null;
        while(hash == null){
            hash = shortid.generate().toLowerCase();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
        }
        await OSController.execSilentCommand(`vboxmanage snapshot ${node.hostname} take "${hash}"`, true);
        return hash;
    }

    /**
     * restoreSnapshot
     * @param {*} node 
     * @param {*} snapshotName
     */
    static async restoreSnapshot(node, snapshotName) {
        let vagrantBase = path.join(process.env.VM_BASE_DIR, "workplaces", node.workspaceId.toString(), node.hostname);
        await OSController.execSilentCommand(path.join(vagrantBase, "stop_vm.sh"));
        let _error = null;
        try {
            await OSController.execSilentCommand(`vboxmanage snapshot ${node.hostname} restore "${snapshotName}"`);
            await OSController.execSilentCommand(`vboxmanage snapshot ${node.hostname} delete "${snapshotName}"`);
        } catch (error) {
            _error = error;
        }
        
        try {await OSController.execSilentCommand(path.join(vagrantBase, "start_vm.sh"));} catch (error) {}
        
        if(_error) {
            throw _error;
        }
    }

    /**
     * deleteSnapshot
     * @param {*} node 
     * @param {*} snapshotName
     */
    static async deleteSnapshot(node, snapshotName) {
        await OSController.execSilentCommand(`vboxmanage snapshot ${node.hostname} delete "${snapshotName}"`);
    }

    /**
     * 
     * @param {*} ip 
     * @param {*} localPath 
     * @param {*} targetPath 
     */
    static copySsh(ip, localPath, targetPath) {
        return new Promise((resolve, reject) => {
            let ssh = new node_ssh();
        
            ssh.connect({
                host: ip,
                username: 'root',
                password: 'vagrant'
            }).then(function() {
                ssh.putFile(localPath, targetPath).then(function() {
                    ssh.dispose();
                    resolve();
                }, function(error) {
                    console.log("err", error);
                    ssh.dispose();
                    reject(error);
                })
            });
        });
    }

    /**
     * feedbackSshExec
     * @param {*} ip 
     * @param {*} command 
     */
    static feedbackSshExec(ip, command, cb) {
        console.log(`SSH Command (${ip}): ", ${command}`);
        return new Promise((resolve, reject) => {
            let ssh = new node_ssh();
        
            ssh.connect({
                host: ip,
                username: 'root',
                password: 'vagrant'
            }).then(function() {
                try {
                    let sploit = command.split(' ');
                    let cmd = sploit.shift();
                    ssh.exec(cmd, sploit, {
                        onStdout(chunk) {
                            cb(chunk.toString('utf8'));
                        },
                        onStderr(chunk) {
                            cb(null, chunk.toString('utf8'));
                            ssh.dispose();
                            reject(new Error(chunk.toString('utf8')));
                        }
                    }).then(function(result) {
                        resolve();
                    });
                } catch (error) {
                    ssh.dispose();
                    reject(error);
                }
            }).catch((error) => {
                reject(error);
            });
        });
    }

    /**
     * sshExec
     * @param {*} ip 
     * @param {*} command 
     */
    static sshExec(ip, command, inline, ignoreStderr) {
        console.log(`SSH Command (${ip}): ", ${command}`);
        return new Promise((resolve, reject) => {
            let ssh = new node_ssh();
        
            ssh.connect({
                host: ip,
                username: 'root',
                password: 'vagrant'
            }).then(function() {
                try {
                    if(Array.isArray(command)){
                        let _cmdAsync = (_cmd) => {
                            return new Promise((_resolve, _reject) => {
                                ssh.execCommand(_cmd, {}).then(function(result) {
                                    _resolve(result);
                                })
                            });
                        }
                        (async() => {
                            let result = [];
                            for(let i=0; i<command.length; i++){
                                let _r = await _cmdAsync(command[i]);
                                result.push(_r);
                                if(!ignoreStderr && _r.stderr && _r.stderr.length > 0){
                                    i = command.length; // Jump out
                                }
                            }
                            ssh.dispose();
                            resolve(result);
                        })();
                    } else {
                        if(!inline){
                            let sploit = command.split(' ');
                            let cmd = sploit.shift();
                            ssh.exec(cmd, sploit, { stream: 'stdout', options: { pty: true } }).then((result) => {
                                ssh.dispose();
                                resolve(result);
                            });
                        } else {
                            ssh.execCommand(command, {}).then(function(result) {
                                ssh.dispose();
                                resolve(result);
                            })
                        }
                    }
                } catch (error) {
                    ssh.dispose();
                    reject(error);
                }
            }).catch((error) => {
                reject(error);
            });
        });
    }

    /**
     * deployNewCluster
     * @param {*} dbHostNode 
     * @param {*} workspaceId 
     * @param {*} rUser 
     * @param {*} rPass 
     * @param {*} eventCb 
     */
    static async deployNewCluster(dbHostNode, workspaceId, rUser, rPass, eventCb) {
        let hash = null;
        while(hash == null){
            hash = shortid.generate().toLowerCase();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
        }
        let targetFolder = path.join(process.env.VM_BASE_DIR, "workplaces", workspaceId.toString(), `master.${hash}`);   
        let vagrantTemplateArray; 
        let leasedIp = null; // Only used if DHCP overwrite is activated        
        try{            
            if(process.env.DHCP_OVERWRITE){
                eventCb("Leasing IP from controller for master node");
                let assignedIpResponse = await this.mqttController.queryRequestResponse("taskmanager", "leaseIp");
                if(!assignedIpResponse || !assignedIpResponse.data.leasedIp){
                    throw new Error("No IP could be leased");
                }
                leasedIp = assignedIpResponse.data.leasedIp;
            }
            mkdirp.sync(targetFolder);

            // Create ingress rules file
            let ingressRulesPath = path.join("controllers", "tasks", "k8s_templates", "ingress-rules.yaml");
            OSController.copyFile(ingressRulesPath, targetFolder);

            // Create pod presets file
            let podPresetsPath = path.join("controllers", "tasks", "k8s_templates", "pod-preset.yaml");
            OSController.copyFile(podPresetsPath, targetFolder);

            // Prepare Vagrantfile
            vagrantTemplateArray = OSController.readFileToArray(path.join("controllers", "tasks", "templates", "master", "Vagrantfile"));
            let WS_ID = "<WS_ID>";
            let IF_NAME = "<IF_NAME>";
            let STATIC_IP = "<STATIC_IP>";
            vagrantTemplateArray = vagrantTemplateArray.map(l => {
                while(l.indexOf(WS_ID) != -1){
                    l = `${l.substring(0, l.indexOf(WS_ID))}${hash}${l.substring(l.indexOf(WS_ID)+7)}`;
                }
                while(l.indexOf(IF_NAME) != -1){
                    l = `${l.substring(0, l.indexOf(IF_NAME))}${process.env.DEFAULT_INET_INTERFACE}${l.substring(l.indexOf(IF_NAME)+9)}`;
                }
                while(l.indexOf(STATIC_IP) != -1){
                    l = `${l.substring(0, l.indexOf(STATIC_IP))}${leasedIp ? ', ip: "'+leasedIp+'"' : ""}${l.substring(l.indexOf(STATIC_IP)+11)}`;
                }
                return l;
            });

            OSController.writeArrayToFile(path.join(targetFolder, "Vagrantfile"), vagrantTemplateArray);
        } catch(err) {
            // if (fs.existsSync(targetFolder)) {
            //     await rmfr(targetFolder);
            // }
            if(leasedIp){
                this.mqttController.client.publish(`/mycloud/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                    leasedIp: leasedIp
                }));
            }
            throw err;
        }

        // Start deploy script
        try{
            eventCb("Initializing cluster VM");
            // Create VM and bootstrap it
            let provisioningScript = path.join(process.env.VM_BASE_DIR, "provisioning_scripts", "k8s", "deploy_master.sh");
            await OSController.execMyCloudScript(`${provisioningScript} ${workspaceId} master.${hash} ${rUser} ${rPass}`);

            eventCb("Installing & bootstraping cluster components");
            // Get IP for this new node and update vagrant file accordingly
            let ipHostnameScript = path.join(process.env.VM_BASE_DIR, "provisioning_scripts", "k8s", "get_ip_hostname.sh");
            let masterIpHost = await OSController.execSilentCommand(`${ipHostnameScript} ${workspaceId} master.${hash}`);
            if(!leasedIp){
                vagrantTemplateArray = vagrantTemplateArray.map(l => {
                    if(l.indexOf(`master.vm.network "public_network", bridge:`) != -1){
                        l += `, ip: "${masterIpHost[0]}"`;                    
                    }
                    return l;
                });
            }
            OSController.writeArrayToFile(path.join(targetFolder, "Vagrantfile"), vagrantTemplateArray);

            // Copy over some base scripts to controll the vagrant vm
            OSController.copyFile(path.join("controllers", "tasks", "scripts", "start_vm.sh"), targetFolder);
            OSController.copyFile(path.join("controllers", "tasks", "scripts", "stop_vm.sh"), targetFolder);
            OSController.copyFile(path.join("controllers", "tasks", "scripts", "destroy_vm.sh"), targetFolder);

            // Update hostnames with registry domain and login to registry
            // This is done here rather than from the bootstrap script because we need to fetch the workspace org credentials for the registry
            await this.sshExec(masterIpHost[0], `echo "${process.env.REGISTRY_IP} mycloud.registry.com docker-registry registry.mycloud.org" >> /etc/hosts`, true);
            await this.sshExec(masterIpHost[0], `printf "${rPass}" | docker login registry.mycloud.org:5043 --username ${rUser} --password-stdin`, true);

            // Install nginx ingress controller on cluster
            await this.sshExec(masterIpHost[0], [
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/ns-and-sa.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/rbac/rbac.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/default-server-secret.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/nginx-config.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/custom-resource-definitions.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/deployment/nginx-ingress.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/daemon-set/nginx-ingress.yaml`
            ], true);

            eventCb("Initiating VM SATA Controller");

            // Mount the SATA controller to the VM
            await OSController.execSilentCommand(path.join(targetFolder, "stop_vm.sh"));
            await OSController.execSilentCommand(`VBoxManage storagectl master.${hash} --name "SATA Controller" --add sata --bootable on`);
            await OSController.execSilentCommand(path.join(targetFolder, "start_vm.sh"));
            
            return {
                "nodeIp": masterIpHost[0],
                "nodeHostname": masterIpHost[1],
                "workspaceId": workspaceId,
                "hostId": dbHostNode.id,
                "hash": hash,
                "ipLeased": leasedIp,
                "targetFolder": targetFolder
            };
        } catch(errArray) {
            let created = await this.vmExists(`master.${hash}`);
            if(created){
                await this.stopDeleteVm(`master.${hash}`, workspaceId);
            }
            if(leasedIp){
                this.mqttController.client.publish(`/mycloud/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                    leasedIp: leasedIp
                }));
            }
            throw new Error(Array.isArray(errArray) ? errArray.map(e => e.message).join(" ; ") : errArray.message);
        }
    }

    /**
     * deployWorker
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async deployWorker(topicSplit, payload, rUser, rPass) {
        let hash = null;
        while(hash == null){
            hash = shortid.generate().toLowerCase();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
        }
        let wsId = payload.masterNode.workspaceId;
        let vagrantTemplateArray; 
        let leasedIp = null; // Only used if DHCP overwrite is activated  
        let targetFolder = path.join(process.env.VM_BASE_DIR, "workplaces", wsId.toString(), `worker.${hash}`);   
        try {
            // Prepare Vagrantfile
            mkdirp.sync(targetFolder);
            vagrantTemplateArray = OSController.readFileToArray(path.join("controllers", "tasks", "templates", "worker", "Vagrantfile"));

            if(process.env.DHCP_OVERWRITE){
                let assignedIpResponse = await this.mqttController.queryRequestResponse("taskmanager", "leaseIp");
                if(!assignedIpResponse || !assignedIpResponse.data.leasedIp){
                    throw new Error("No IP could be leased");
                }
                leasedIp = assignedIpResponse.data.leasedIp;
            }
            
            let WS_ID = "<WS_ID>";
            let IF_NAME = "<IF_NAME>";
            let STATIC_IP = "<STATIC_IP>";
            vagrantTemplateArray = vagrantTemplateArray.map(l => {
                while(l.indexOf(WS_ID) != -1){
                    l = `${l.substring(0, l.indexOf(WS_ID))}${hash}${l.substring(l.indexOf(WS_ID)+7)}`;
                }
                while(l.indexOf(IF_NAME) != -1){
                    l = `${l.substring(0, l.indexOf(IF_NAME))}${process.env.DEFAULT_INET_INTERFACE}${l.substring(l.indexOf(IF_NAME)+9)}`;
                }
                while(l.indexOf(STATIC_IP) != -1){
                    l = `${l.substring(0, l.indexOf(STATIC_IP))}${leasedIp ? ', ip: "'+leasedIp+'"' : ""}${l.substring(l.indexOf(STATIC_IP)+11)}`;
                }
                return l;
            });

            OSController.writeArrayToFile(path.join(targetFolder, "Vagrantfile"), vagrantTemplateArray);
        } catch (errorArray) {
            if (fs.existsSync(targetFolder)) {
                await rmfr(targetFolder);
            }
            if(leasedIp){
                this.mqttController.client.publish(`/mycloud/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                    leasedIp: leasedIp
                }));
            }

            let bubbleUpError = new Error(Array.isArray(errorArray) ? errorArray.map(e => e.message).join(" ; ") : errorArray.message);
            bubbleUpError.code = Array.isArray(errorArray) ? 500 : (errorArray.code ? errorArray.code : 500);
            throw bubbleUpError;
        }

        // Start deploy script
        try{
            let provisioningScript = path.join(process.env.VM_BASE_DIR, "provisioning_scripts", "k8s", "deploy_worker.sh");
            await OSController.execMyCloudScript(`${provisioningScript} ${wsId.toString()} worker.${hash} ${payload.masterNode.ip} ${rUser} ${rPass}`);

            let ipHostnameScript = path.join(process.env.VM_BASE_DIR, "provisioning_scripts", "k8s", "get_ip_hostname.sh");
            let workerIpHost = await OSController.execSilentCommand(`${ipHostnameScript} ${wsId.toString()} worker.${hash}`);
            if(!leasedIp){
                vagrantTemplateArray = vagrantTemplateArray.map(l => {
                    if(l.indexOf(`worker.vm.network "public_network", bridge:`) != -1){
                        l += `, ip: "${workerIpHost[0]}"`;                    
                    }
                    return l;
                });
            }

            OSController.writeArrayToFile(path.join(targetFolder, "Vagrantfile"), vagrantTemplateArray);

            OSController.copyFile(path.join("controllers", "tasks", "scripts", "start_vm.sh"), targetFolder);
            OSController.copyFile(path.join("controllers", "tasks", "scripts", "stop_vm.sh"), targetFolder);
            OSController.copyFile(path.join("controllers", "tasks", "scripts", "destroy_vm.sh"), targetFolder);

            // Update hostnames with registry domain and login to registry
            // This is done here rather than from the bootstrap script because we need to fetch the workspace org credentials for the registry
            await this.sshExec(workerIpHost[0], `echo "${process.env.REGISTRY_IP} mycloud.registry.com docker-registry registry.mycloud.org" >> /etc/hosts`, true);
            await this.sshExec(workerIpHost[0], `printf "${rPass}" | docker login registry.mycloud.org:5043 --username ${rUser} --password-stdin`, true);

            await OSController.execSilentCommand(path.join(targetFolder, "stop_vm.sh"));
            await OSController.execSilentCommand(`VBoxManage storagectl worker.${hash} --name "SATA Controller" --add sata --bootable on`);
            await OSController.execSilentCommand(path.join(targetFolder, "start_vm.sh"));

            return {
                "nodeIp": workerIpHost[0],
                "nodeHostname": workerIpHost[1],
                "workspaceId": wsId,
                "hostId": payload.masterHost.id,
                "hash": hash,
                "ipLeased": leasedIp,
                "targetFolder": targetFolder
            };
        } catch(errArray) {
            let created = await this.vmExists(`worker.${hash}`);
            if(created){
                await this.stopDeleteVm(`worker.${hash}`, wsId);
            }

            if (fs.existsSync(targetFolder)) {
                await rmfr(targetFolder);
            }
            if(leasedIp){
                this.mqttController.client.publish(`/mycloud/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                    leasedIp: leasedIp
                }));
            }

            let bubbleUpError = new Error(Array.isArray(errArray) ? errArray.map(e => e.message).join(" ; ") : errArray.message);
            bubbleUpError.code = Array.isArray(errArray) ? 500 : (errArray.code ? errArray.code : 500);
            throw bubbleUpError;
        }
    }

    /**
     * grabConfigFile
     * @param {*} masterIp 
     * @param {*} workspaceId 
     */
    static async grabMasterConfigFile(masterIp, workspaceId) {
        let ssh = new node_ssh();
        
        await ssh.connect({
            host: masterIp,
            username: 'root',
            password: 'vagrant'
        });
        let hash = null;
        while(hash == null){
            hash = shortid.generate().toLowerCase();
            if(hash.indexOf("$") != -1 || hash.indexOf("@") != -1){
                hash = null;
            }
        }
        let tmpFileName = path.join(process.env.VM_BASE_DIR, "workplaces", workspaceId.toString(), `${hash}.conf`);

        // Local, Remote
        await ssh.getFile(
            tmpFileName, 
            '/etc/kubernetes/admin.conf'
        );

        ssh.dispose();

        return tmpFileName;
    }

    /**
     * deleteK8SResource
     * @param {*} masterNode 
     * @param {*} resource 
     * @param {*} name 
     */
    static async deleteK8SResource(masterNode, ns, resource, name) {
        await this.sshExec(masterNode.ip, `kubectl delete ${resource} ${name}${ns ? " --namespace=" + ns : ""}`, true, true);
    }

    /**
     * detatchWorker
     * @param {*} masterNode 
     * @param {*} workerNode 
     */
    static async detatchWorker(masterNode, workerNode) {
        await this.sshExec(masterNode.ip, `kubectl drain ${workerNode.hostname} --ignore-daemonsets --delete-local-data`);
        await this.sshExec(masterNode.ip, `kubectl delete node ${workerNode.hostname}`);
    }

    /**
     * taintMaster
     * @param {*} masterNode 
     */
    static async taintMaster(masterNode) {
        await this.sshExec(masterNode.ip, `kubectl taint nodes ${masterNode.hostname} ${masterNode.hostname}=DoNotSchedulePods:NoExecute`);
    }

    /**
     * untaintMaster
     * @param {*} masterNode
     */
    static async untaintMaster(masterNode) {
        await this.sshExec(masterNode.ip, `kubectl taint nodes ${masterNode.hostname} ${masterNode.hostname}:NoExecute-`);
    }

    /**
     * getK8SResources
     * @param {*} masterNode 
     * @param {*} resourceName 
     */
    static async getK8SResources(masterNode, ns, resourceName, resourceLabels, jsonOutput) {
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
        cmd = `${cmd}${nsString}${jsonOutput ? " -o=json":""}`;
        
        let r = await this.sshExec(masterNode.ip, cmd, true);
       
        if(r.code != 0) {
            if(resourceLabels && resourceLabels.length == 1 && r.stderr.indexOf("Error from server (NotFound):") != -1){
                return [];
            } else {
                console.log(r);
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
        
        let r = await this.sshExec(masterNode.ip, cmd, true);
        if(r.code != 0) {
            console.log(r);
            throw new Error("Could not get resources on cluster");
        } 
        if(r.stdout.toLowerCase().indexOf("no resources found") != -1){
            return null;
        }

        return r.stdout.split("\n");
    }

    /**
     * applyK8SYaml
     * @param {*} yamlFilePath 
     * @param {*} node 
     */
    static async applyK8SYaml(yamlFilePath, ns, node) {
        try {
            await this.copySsh(node.ip, yamlFilePath, `/root/${path.basename(yamlFilePath)}`);
            // Wait untill kubectl answers for 100 seconds max
            let attempts = 0;
            let success = false;
            while(!success && attempts <= 30){
                await _sleep(1000 * 5);
                
                let r = await this.sshExec(node.ip, `kubectl apply -f /root/${path.basename(yamlFilePath)}${ns ? " --namespace=" + ns:""}`, true);
                if(r.code == 0) {
                    success = true;
                } else {
                    if(r.stderr.indexOf("6443 was refused") != -1 || r.stderr.indexOf("handshake timeout") != -1){
                        attempts++;
                    } else {
                        console.log("applyK8SYaml =>", JSON.stringify(r, null, 4));
                        attempts = 31; // Jump out of loop
                    }            
                }
            }
            if(!success){
                throw new Error("Could not apply yaml resource on cluster");
            }
        } finally {
            await this.sshExec(node.ip, `rm -rf /root/${path.basename(yamlFilePath)}`, true);
        }
    }

    /**
     * kubectl
     * @param {*} command 
     * @param {*} node 
     */
    static async kubectl(command, node) {
        // Wait untill kubectl answers for 100 seconds max
        let attempts = 0;
        let success = false;
        while(!success && attempts <= 30){
            await _sleep(1000 * 5);
            
            let r = await this.sshExec(node.ip, command, true);
            if(r.code == 0) {
                success = true;
            } else {
                if(r.stderr.indexOf("6443 was refused") != -1){
                    attempts++;
                } else {
                    console.log(JSON.stringify(r, null, 4));
                    attempts = 31; // Jump out of loop
                }            
            }
        }
        if(!success){
            throw new Error("Could not execute command: " + command);
        }
    }

    /**
     * deleteHelmService
     * @param {*} serviceName 
     * @param {*} node 
     */
    static async deleteHelmService(serviceName, ns, node) {
        let r = await this.sshExec(node.ip, `helm uninstall ${serviceName}${ns ? " --namespace " + ns:""}`, true);
        if(r.code != 0) {
            console.log(JSON.stringify(r, null, 4));
            throw new Error("Could not uninstall helm service instance");
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

        let helmChartTargetPath = `/root/${path.basename(chartTarFilePath)}`;
        await this.copySsh(node.ip, chartTarFilePath, helmChartTargetPath);
        await _sleep(1000);

        // Execute HELM command
        let helmCmd = `helm install ${pString}--output yaml${ns ? " --namespace " + ns : ""} ${serviceName} ${helmChartTargetPath}`;
        let r = await this.sshExec(node.ip, helmCmd, true);
        await _sleep(2000);
        await this.sshExec(node.ip, `rm -rf ${helmChartTargetPath}`, true);

        if(r.code != 0) {
            console.log(JSON.stringify(r, null, 4));
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
            await this.getK8SResources({ip: node.ip}, ns, "services", null);

            let serviceObjs = await this.getK8SResources({ip: node.ip}, ns, "services", [clusterIPServiceName]);
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
            await this.sshExec(node.ip, `helm uninstall ${serviceName}${ns ? " --namespace " + ns : ""}`, true);
            throw error;
        }

        return output;
    }

    /**
     * removePersistantVolume
     * @param {*} pvName 
     * @param {*} node 
     */
    static async removePersistantVolume(pvName, ns, node, ignoreErrors) {
        try {
            await this.waitUntilUp(node.ip);
            let r = await this.sshExec(node.ip, `kubectl get pv ${pvName}${ns ? " --namespace="+ns : ""}`, true);
            if(!ignoreErrors && r.code != 0) {
                console.log(r);
                throw new Error("Could not delete PV on cluster");
            } 
            if(r.code == 0 && r.stdout.toLowerCase().indexOf("no resources found") == -1){
                await this.kubectl(`kubectl patch pv ${pvName}${ns ? " --namespace="+ns : ""} -p '{"metadata": {"finalizers": null}}'`, node);
                await this.kubectl(`kubectl delete pv ${pvName}${ns ? " --namespace="+ns : ""} --grace-period=0 --force`, node);
            }
        } catch (error) {
            console.log(JSON.stringify(error, null, 4));
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
            await this.waitUntilUp(node.ip);
            let r = await this.sshExec(node.ip, `kubectl get pvc ${pvcName}${ns ? " --namespace=" + ns:""}`, true);
            if(r.code != 0) {
                throw new Error("Could not delete PVC on cluster");
            } 
            if(r.stdout.toLowerCase().indexOf("no resources found") == -1){
                await this.kubectl(`kubectl delete pvc ${pvcName}${ns ? " --namespace=" + ns:""}`, node);
            }            
        } catch (error) {
            console.log(JSON.stringify(error, null, 4));
            throw new Error("Could not delete PVC on cluster");
        }
    }

    /**
     * mountGlusterVolume
     * @param {*} node 
     */ 
    static async mountGlusterVolume(node, volumeName, glusterIp) {
        let r = await this.sshExec(node.ip, `test -d "/mnt/${volumeName}" && echo "y" || echo "n"`, true);
        if(r.code == 0 && r.stdout == "y") {
            r = await this.sshExec(node.ip, `mount | grep "${volumeName}"`, true);
            if(r.code == 0 && r.stdout.trim() != "") {
                throw new Error("Folder already mounted");
            } 
        }   
        else if(r.code == 0 && r.stdout == "n") {
            r = await this.sshExec(node.ip, `mkdir -p /mnt/${volumeName}`, true);
            if(r.code != 0) {
                throw new Error("Could not create mount folder");
            } 
        }
        else if(r.code != 0){
            throw new Error("An error occured trying to unmount volume");
        }

        r = await this.sshExec(node.ip, `mount.glusterfs ${glusterIp}:/${volumeName} /mnt/${volumeName}`, true);
        if(r.code != 0) {
            await this.unmountVolume(node, volumeName, glusterIp);
            throw new Error("Could not mount folded");
        }

        r = await this.sshExec(node.ip, `chown -R vagrant:vagrant /mnt/${volumeName}`, true);
        if(r.code != 0) {
            await this.unmountVolume(node, volumeName, glusterIp);
            throw new Error("Could not assign permissions on folder");
        }
        r = await this.sshExec(node.ip, `echo '${glusterIp}:/${volumeName}   /mnt/${volumeName}  glusterfs _netdev,auto,x-systemd.automount 0 0' | tee -a /etc/fstab`, true);
        if(r.code != 0) {
            await this.unmountVolume(node, volumeName, glusterIp);
            throw new Error("Could not update fstab");
        }
    }

    /**
     * waitUntilUp
     * @param {*} ip 
     */
    static async waitUntilUp(ip) {
        // Wait untill VM is back up and running
        let isOnline = false;
        let attempts = 0;
        
        while(!isOnline && attempts <= 20){
            await _sleep(1000 * 5);
            try {
                let r = await this.sshExec(ip, `ls -l`, true);
                if(r.code == 0) {
                    isOnline = true;
                } else {
                    attempts++;
                }
            } catch (_e) {
                attempts++;
            }
        }
        return isOnline;
    }

    /**
     * getNextSATAPortIndex
     * @param {*} vmName 
     */
    static async getNextSATAPortIndex(vmName) {
        // Get next IDE Port index
        let volumePorts = await OSController.execSilentCommand(`vboxmanage showvminfo "${vmName}" | grep "SATA Controller ("`, true);
        let usedPorts = [];
        volumePorts.forEach(p => {
            let port = p.substring(p.indexOf('(')+1, p.indexOf(')'));
            if(p.indexOf(": Empty") == -1){
                port = port.split(',').map(o => parseInt(o.trim()))[0];
                usedPorts.push(port);
            }
        });
        for(let i=1; i<20; i++){
            if(usedPorts.indexOf(i) == -1){
                return i;
            }
        }
        return null;
    }

    /**
     * mountLocalVolume
     * @param {*} node 
     * @param {*} volumeName 
     * @param {*} portIndex 
     * @param {*} formatDisk 
     */
    static async mountLocalVolume(node, volumeName, portIndex) {
        console.log("MOUNTING =>", `/mnt/${volumeName}`);
        let r = await this.sshExec(node.ip, `test -d "/mnt/${volumeName}" && echo "y" || echo "n"`, true);
        if(r.code == 0 && r.stdout == "y") {
            r = await this.sshExec(node.ip, `mount | grep "${volumeName}"`, true);
            if(r.code == 0 && r.stdout.trim() != "") {
                // throw new Error("Folder already mounted");
                return;
            } 
        }
        else if(r.code != 0){
            throw new Error("An error occured trying to mount volume");
        }
        
        let mkdirMountFolderCommand = `mkdir -p /mnt/${volumeName}`;
        let updFstabCommand = `echo '/dev/sd${portLetterMap[portIndex]} /mnt/${volumeName} xfs defaults 1 2' >> /etc/fstab`;
        let mountCommand = `mount -a && mount`;
        
        r = await this.sshExec(node.ip, `lsblk -f | grep 'sd${portLetterMap[portIndex]}' | grep 'xfs'`, true);
        if(r.stderr.trim().length == 0 && r.stdout.trim() == "") {
            // Format the disk
            let formatDiskCommand = `mkfs.xfs /dev/sd${portLetterMap[portIndex]}`;
            r = await this.sshExec(node.ip, formatDiskCommand, true);
            if(r.code != 0) {
                throw new Error(r.stderr);
            }
        } else if(r.code != 0) {
            throw new Error(r.stderr);
        }

        // Mkdir
        r = await this.sshExec(node.ip, mkdirMountFolderCommand, true);
        if(r.code != 0) {
            throw new Error(r.stderr);
        }
       
        // Update FSTab
        try {
            r = await this.sshExec(node.ip, updFstabCommand, true);
            if(r.code != 0) {
                await this.unmountVolume(node, volumeName);
                throw new Error(r.stderr);
            }
        } catch (error) {
            await this.unmountVolume(node, volumeName);
            throw error;
        }
        // Mount disk
        try {
            r = await this.sshExec(node.ip, mountCommand, true);
            if(r.code != 0) {
                await this.unmountVolume(node, volumeName);
                throw new Error(r.stderr);
            }

        } catch (error) {
            await this.unmountVolume(node, volumeName);
            throw error;
        }
    }

    /**
     * attachLocalVolumeToVM
     * @param {*} workspaceId 
     * @param {*} node 
     * @param {*} volumeName 
     * @param {*} size 
     * @param {*} portIndex 
     */
    static async attachLocalVolumeToVM(workspaceId, node, volumeName, size, portIndex) {
        if(portIndex == null){
            throw new Error("SATA port index is null");
        }
        
        let vagrantBase = path.join(process.env.VM_BASE_DIR, "workplaces", workspaceId.toString(), node.hostname);
        let localVolumeFile = path.join(vagrantBase, `${volumeName}.vdi`);
        let stopvmCommand = path.join(vagrantBase, "stop_vm.sh");
        let startvmCommand = path.join(vagrantBase, "start_vm.sh");
        let diskExisted = true;
        try {
            if (!fs.existsSync(localVolumeFile)) {
                let createVolumeCommand = `vboxmanage createhd --filename ${localVolumeFile} --format VDI --size ${size}`;         
                // Create disk
                await OSController.execSilentCommand(createVolumeCommand);
                await _sleep(3000);
                diskExisted = false;

                await OSController.execSilentCommand(`chmod a+rw ${localVolumeFile}`);
            }
            // Stop the VM
            await OSController.execSilentCommand(stopvmCommand);
        } catch (error) {
            throw error;
        }
        let attachVolumeCommand = `vboxmanage storageattach ${node.hostname} --storagectl "SATA Controller" --port ${portIndex} --device 0 --type hdd --medium ${localVolumeFile}`;
        let detatchVolumeCommand = `vboxmanage storageattach ${node.hostname} --storagectl "SATA Controller" --port ${portIndex} --device 0 --type hdd --medium none`;
        // Attach volume to VM
        try {
            let r = await OSController.execSilentCommand(attachVolumeCommand);
            await _sleep(1000);
        } catch (error) {
            await OSController.execSilentCommand(startvmCommand);
            throw error;
        }
        // Start the VM
        try {
            await OSController.execSilentCommand(startvmCommand);
        } catch (error) {
            await OSController.execSilentCommand(detatchVolumeCommand);
            throw error;
        }
        // Wait untill VM is back up and running
        let isOnline = await this.waitUntilUp(node.ip);
        // If VM did not restart in time, throw exception
        if(!isOnline){
            await OSController.execSilentCommand(detatchVolumeCommand);
            await _sleep(1000);
            await OSController.execSilentCommand(startvmCommand);
            throw new Error("Could not restart VM after attaching new disk");
        }
    }

    /**
     * unmountVolume
     * @param {*} node 
     * @param {*} volumeName 
     */
    static async unmountVolume(node, volumeName) {
        console.log("UNMOUNTING VOLUME " + volumeName);
        let r = await this.sshExec(node.ip, `test -d "/mnt/${volumeName}" && echo "y" || echo "n"`, true);
        if(r.code == 0 && r.stdout == "y") {
            r = await this.sshExec(node.ip, `mount | grep "${volumeName}"`, true);
            // If volume mounted
            if(r.code == 0 && r.stdout.trim() != "") {
                await this.sshExec(node.ip, `umount /mnt/${volumeName}`, true);
            }
            // If also declared in fstab, remove it from there as well
            r = await this.sshExec(node.ip, `cat /etc/fstab | grep "/mnt/${volumeName}"`, true);
            if(r.code == 0 && r.stdout.trim() != "") {
                await this.sshExec(node.ip, `sed -i '\\|/mnt/${volumeName}|d' /etc/fstab`, true);
            }
            // Delete folders
            await this.sshExec(node.ip, `rm -rf /mnt/${volumeName}`, true);
        } else if(r.code != 0) {
            throw new Error("An error occured trying to unmount volume");
        }
        else {
            console.log(`Nothing to unmount /mnt/${volumeName}`);
        }
    }

    /**
     * detatchLocalK8SVolume
     * @param {*} node 
     * @param {*} sataPortIndex 
     * @param {*} delLocalVolumeFile 
     */
    static async detatchLocalK8SVolume(node, sataPortIndex, delLocalVolumeFile, skipRestart) {
        let vagrantBase = path.join(process.env.VM_BASE_DIR, "workplaces", node.workspaceId.toString(), node.hostname);
        let stopvmCommand = path.join(vagrantBase, "stop_vm.sh");
        let startvmCommand = path.join(vagrantBase, "start_vm.sh");
        let detatchVolumeCommand = `vboxmanage storageattach ${node.hostname} --storagectl "SATA Controller" --port ${sataPortIndex} --device 0 --type hdd --medium none`;
        
        await OSController.execSilentCommand(stopvmCommand);
        await _sleep(2000);
        await OSController.execSilentCommand(detatchVolumeCommand);
        await _sleep(2000);
        if(delLocalVolumeFile){
            await this.cleanUpDeletedVolume(node, null, delLocalVolumeFile);
        }
        if(!skipRestart){
            await OSController.execSilentCommand(startvmCommand);
            await this.waitUntilUp(node.ip);  
        }
    }

    /**
     * cleanUpDeletedVolume
     * @param {*} node 
     * @param {*} volumeName 
     * @param {*} volumeFilePath 
     */
    static async cleanUpDeletedVolume(node, volumeName, volumeFilePath) {
        if(!volumeFilePath)
            volumeFilePath = path.join(process.env.VM_BASE_DIR, "workplaces", node.workspaceId.toString(), node.hostname, `${volumeName}.vdi`);
        let vmVolumes = await OSController.execSilentCommand(`vboxmanage list hdds | grep 'UUID\\|Location:'`, true);
        for(let i=0; i<vmVolumes.length; i++){
            if(vmVolumes[i].indexOf("Location:") == 0 && vmVolumes[i].indexOf(volumeFilePath) != -1){
                let filePath = vmVolumes[i].split(':')[1].trim();
                let uuid = vmVolumes[i-2].split(':')[1].trim();
                await OSController.execSilentCommand(`vboxmanage closemedium disk ${uuid} --delete`);
                await OSController.execSilentCommand(`rm -rf ${filePath}`);
            }
        } 
    }

    /**
     * vmExists
     * @param {*} name 
     */
    static async vmExists(name) {
        let output = await OSController.execSilentCommand(`vboxmanage list vms`);
        let isRunning = output.find(l => l.indexOf(name) != -1);
        return isRunning ? true : false;      
    }

    /**
     * stopDeleteVm
     * @param {*} name 
     */
    static async stopDeleteVm(name, workspaceId) {
        let output = await OSController.execSilentCommand(`vboxmanage list runningvms`);
        let isRunning = output.find(l => l.indexOf(name) != -1);
        if(isRunning){
            await OSController.execSilentCommand(`vboxmanage controlvm ${name} poweroff soft`);
        }    
        await OSController.execSilentCommand(`vboxmanage unregistervm --delete ${name}`);
        let targetFolder = path.join(process.env.VM_BASE_DIR, "workplaces", workspaceId.toString(), `${name.indexOf("master") != -1 ? "master":"worker"}.${name.split(".")[1]}`);
        if (targetFolder && fs.existsSync(targetFolder)) {
            await rmfr(targetFolder);
        }    
    }

    /**
     * getK8SState
     * @param {*} masterNode 
     */
    static async getK8SState(masterNode) {
        let nodeStates = await this.sshExec(masterNode.ip, `kubectl get nodes -o wide`);
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
     * ensureNodesStarted
     */
    static ensureNodesStarted() {
        (async() => {
            try {
                if(this.inMaintenance){
                    return;
                }
                this.inMaintenance = true;
                let output = await OSController.execSilentCommand(`vboxmanage list vms | cut -d ' ' -f 1`);
                for(let i=0; i<output.length; i++){
                    let vmName = output[i].substring(1, output[i].length-1);
                    if(["master.mycloud-base"].indexOf(vmName) == -1 && (vmName.indexOf("master.") == 0 || vmName.indexOf("worker.") == 0)){
                        let state = await OSController.execSilentCommand(`vboxmanage showvminfo "${vmName}" | grep -e ^State`);
                        if(state.length == 1){
                            if(state[0].toLowerCase().indexOf("saved") != -1){
                                await OSController.execSilentCommand(`vboxmanage startvm ${vmName} --type headless`);
                            } else if(state[0].toLowerCase().indexOf("paused") != -1){
                                await OSController.execSilentCommand(`vboxmanage controlvm ${vmName} resume`);
                            } else if(state[0].toLowerCase().indexOf("powered") != -1){
                                await OSController.execSilentCommand(`vboxmanage startvm ${vmName} --type headless`);
                            }
                        }
                    }
                }
                this.inMaintenance = false;
            } catch (error) {
                console.log(error);
                this.inMaintenance = false;
            }
        })();
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
       
        await this.copySsh(node.ip, tmpZipFile, zipPath);

        await this.sshExec(node.ip, `printf "${rPass}" | docker login registry.mycloud.org:5043 --username ${rUser} --password-stdin`);

        let buildDone = false;
        try {
            let outputArray = await this.sshExec(node.ip, [
                `mkdir -p ${folderPath}`,
                `unzip ${zipPath} -d ${folderPath}`
            ]);
            let error = outputArray.find(o => o.code != 0);
            if(error){
                throw new Error(error.stderr);
            }
            await this.feedbackSshExec(node.ip, `docker build -t ${imageName}:${imageVersion} ${folderPath}`, cb);
            buildDone = true;
            await this.feedbackSshExec(node.ip, `docker tag ${imageName}:${imageVersion} registry.mycloud.org:5043/${accountName}/${orgName}/${imageName}:${imageVersion}`, cb);
            await this.feedbackSshExec(node.ip, `docker push registry.mycloud.org:5043/${accountName}/${orgName}/${imageName}:${imageVersion}`, cb);
        } finally {
            try {
                if(buildDone){
                    await this.sshExec(node.ip, 
                        `docker image rm registry.mycloud.org:5043/${accountName}/${orgName}/${imageName}:${imageVersion}`
                    );
                }
                await this.sshExec(node.ip, `rm -rf ${folderPath}`);
                await this.sshExec(node.ip, `rm -rf ${zipPath}`);
            } catch (_e) {}
        }
    }

    /**
     * deleteRegistryImage
     * @param {*} node 
     * @param {*} imageName 
     * @param {*} rUser 
     * @param {*} rPass 
     */
    static async deleteRegistryImage(node, imageName, rUser, rPass) {
        await this.sshExec(node.ip, `printf "${rPass}" | docker login registry.mycloud.org:5043 --username ${rUser} --password-stdin`);
        let tagsResponse = await this.sshExec(node.ip, `curl -k -X GET https://${rUser}:${rPass}@registry.mycloud.org:5043/v2/${imageName}/tags/list`);
        tagsResponse = JSON.parse(tagsResponse);

        let etag = await this.sshExec(node.ip, `curl -k -sSL -I -H "Accept: application/vnd.docker.distribution.manifest.v2+json" "https://${rUser}:${rPass}@registry.mycloud.org:5043/v2/${imageName}/manifests/${tagsResponse.tags[0]}" | awk '$1 == "Docker-Content-Digest:" { print $2 }' | tr -d $'\r'`, true);
        if(etag.code != 0){
            throw new Error("Could not delete image");
        }
        etag = etag.stdout;
        
        if(etag.indexOf("sha256:") != 0){
            throw new Error("Could not delete image");
        }

        let result = await this.sshExec(node.ip, `curl -k -v -sSL -X DELETE "https://${rUser}:${rPass}@registry.mycloud.org:5043/v2/${imageName}/manifests/${etag}"`, true);
        if(result.code != 0){
            throw new Error("Could not delete image");
        }

        await this.sshExec(process.env.REGISTRY_IP, `docker exec -t docker-registry bin/registry garbage-collect /etc/docker/registry/config.yml`, true);
        await this.sshExec(process.env.REGISTRY_IP, `docker exec -t --privileged docker-registry rm -rf /var/lib/registry/docker/registry/v2/repositories/${imageName}`, true);
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
        await this.sshExec(node.ip, `printf "${rPass}" | docker login registry.mycloud.org:5043 --username ${rUser} --password-stdin`);
        let result = await this.sshExec(node.ip, `curl -k -X GET https://${rUser}:${rPass}@registry.mycloud.org:5043/v2/_catalog`);
        result = JSON.parse(result);
        let repos = result.repositories.filter(o => o.indexOf(`${accountName}/${orgName}/`) == 0);
        let tagCommands = repos.map(o => `curl -k -X GET https://${rUser}:${rPass}@registry.mycloud.org:5043/v2/${o}/tags/list`);
        let allTags = await this.sshExec(node.ip, tagCommands, true, true);
        allTags = allTags.map(o => JSON.parse(o.stdout));
        return allTags;
    }
}
EngineController.inMaintenance = false;
module.exports = EngineController;