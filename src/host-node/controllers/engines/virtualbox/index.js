const OSController = require("../../os/index");

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');
const path = require('path');
const fs = require('fs');
const rmfr = require('rmfr');
const mkdirp = require('mkdirp');
const os = require("os");

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

        // Copy over ingress-controller YAML files
        let targetBootstrapK8SIngress = path.join(targetBootstrapK8STemplatesDir, "ingress-controller");
        if (fs.existsSync(targetBootstrapK8SIngress)) {
            await rmfr(targetBootstrapK8SIngress);
        }
        mkdirp.sync(targetBootstrapK8SIngress);
        await OSController.copyDir(path.join(process.cwd(), "resources", "k8s_templates", "ingress-controller"), targetBootstrapK8SIngress);

        // Copy over local-path-provisioner YAML files
        let targetBootstrapK8SLocalProv = path.join(targetBootstrapK8STemplatesDir, "local-path-provisioner");
        if (fs.existsSync(targetBootstrapK8SLocalProv)) {
            await rmfr(targetBootstrapK8SLocalProv);
        }
        mkdirp.sync(targetBootstrapK8SLocalProv);
        await OSController.copyDir(path.join(process.cwd(), "resources", "k8s_templates", "local-path-provisioner"), targetBootstrapK8SLocalProv);

        // Copy over k8s bootstrapping scripts (Vagrant provisioning)
        let targetBootstrapScriptBaseDir = path.join(process.env.VM_BASE_DIR, "bootstrap_scripts");
        let targetBootstrapK8SFolder = path.join(targetBootstrapScriptBaseDir, "k8s");
        if (fs.existsSync(targetBootstrapK8SFolder)) {
            await rmfr(targetBootstrapK8SFolder);
        }
        mkdirp.sync(targetBootstrapK8SFolder);
        await OSController.copyDir(path.join(process.cwd(), "resources", "scripts", "bootstrap_k8s"), targetBootstrapK8SFolder);
        await OSController.chmodr(targetBootstrapScriptBaseDir, 0o755);

        // Copy over k8s bootstrapping scripts
        let targetProvisioningScriptBaseDir = path.join(process.env.VM_BASE_DIR, "provisioning_scripts");
        let targetProvisioningK8SScriptFolder = path.join(targetProvisioningScriptBaseDir, "k8s");
        if (fs.existsSync(targetProvisioningK8SScriptFolder)) {
            await rmfr(targetProvisioningK8SScriptFolder);
        }
        mkdirp.sync(targetProvisioningK8SScriptFolder);
        OSController.copyFile(path.join(process.cwd(), "resources", "scripts", "deploy_master.sh"), targetProvisioningK8SScriptFolder);
        OSController.copyFile(path.join(process.cwd(), "resources", "scripts", "deploy_worker.sh"), targetProvisioningK8SScriptFolder);
        OSController.copyFile(path.join(process.cwd(), "resources", "scripts", "get_ip_hostname.sh"), targetProvisioningK8SScriptFolder);
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
        let isOnline = await OSController.waitUntilUp(node.ip);
        // If VM did not restart in time, throw exception
        if(!isOnline){
            await OSController.execSilentCommand(detatchVolumeCommand);
            await _sleep(1000);
            await OSController.execSilentCommand(startvmCommand);
            throw new Error("Could not restart VM after attaching new disk");
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
            await OSController.waitUntilUp(node.ip);  
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
            let ingressRulesPath = path.join(process.cwd(), "resources", "k8s_templates", "ingress-rules.yaml");
            OSController.copyFile(ingressRulesPath, targetFolder);

            // Create pod presets file
            let podPresetsPath = path.join(process.cwd(), "resources", "k8s_templates", "pod-preset.yaml");
            OSController.copyFile(podPresetsPath, targetFolder);

            // Prepare Vagrantfile
            vagrantTemplateArray = OSController.readFileToArray(path.join(process.cwd(), "resources", "templates", "master", "Vagrantfile"));
            let WS_HASH = "<WS_HASH>";
            let IF_NAME = "<IF_NAME>";
            let STATIC_IP = "<STATIC_IP>";
            let CPLANE_IP = "<CPLANE_IP>";
            let CPUS = "<CPUS>";
            let MP_BASE_PATH = "<MP_BASE_PATH>";

            let mcRootPath = path.normalize(path.join(process.cwd(), '../..'));

            vagrantTemplateArray = vagrantTemplateArray.map(l => {
                while(l.indexOf(WS_HASH) != -1){
                    l = `${l.substring(0, l.indexOf(WS_HASH))}${hash}${l.substring(l.indexOf(WS_HASH)+9)}`;
                }
                while(l.indexOf(IF_NAME) != -1){
                    l = `${l.substring(0, l.indexOf(IF_NAME))}${process.env.DEFAULT_INET_INTERFACE}${l.substring(l.indexOf(IF_NAME)+9)}`;
                }
                while(l.indexOf(STATIC_IP) != -1){
                    l = `${l.substring(0, l.indexOf(STATIC_IP))}${leasedIp ? ', ip: "'+leasedIp+'"' : ""}${l.substring(l.indexOf(STATIC_IP)+11)}`;
                }
                while(l.indexOf(CPLANE_IP) != -1){
                    l = `${l.substring(0, l.indexOf(CPLANE_IP))}${process.env.REGISTRY_IP}${l.substring(l.indexOf(CPLANE_IP)+11)}`;
                }
                while(l.indexOf(CPUS) != -1){
                    l = `${l.substring(0, l.indexOf(CPUS))}${os.cpus().length}${l.substring(l.indexOf(CPUS)+6)}`;
                }
                while(l.indexOf(MP_BASE_PATH) != -1){
                    l = `${l.substring(0, l.indexOf(MP_BASE_PATH))}${mcRootPath}${l.substring(l.indexOf(MP_BASE_PATH)+14)}`;
                }
                return l;
            });

            OSController.writeArrayToFile(path.join(targetFolder, "Vagrantfile"), vagrantTemplateArray);
        } catch(err) {
            if (fs.existsSync(targetFolder)) {
                await rmfr(targetFolder);
            }
            if(leasedIp){
                this.mqttController.client.publish(`/multipaas/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
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

            await OSController.execMultiPaaSScript(`${provisioningScript} ${workspaceId} master.${hash} ${rUser} ${rPass}`, eventCb);
            
            eventCb("Installing & bootstraping cluster components");
            // Get IP for this new node and update vagrant file accordingly
            let ipHostnameScript = path.join(process.env.VM_BASE_DIR, "provisioning_scripts", "k8s", "get_ip_hostname.sh");
            let masterIpHost = await OSController.execSilentCommand(`${ipHostnameScript} ${workspaceId} master.${hash}`);
            
            console.log("MASTER IP =>", masterIpHost);
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
            OSController.copyFile(path.join(process.cwd(), "resources", "scripts", "start_vm.sh"), targetFolder);
            OSController.copyFile(path.join(process.cwd(), "resources", "scripts", "stop_vm.sh"), targetFolder);
            OSController.copyFile(path.join(process.cwd(), "resources", "scripts", "destroy_vm.sh"), targetFolder);
            
            // Update hostnames with registry domain and login to registry
            // This is done here rather than from the bootstrap script because we need to fetch the workspace org credentials for the registry
            // await OSController.sshExec(masterIpHost[0], `echo "${process.env.REGISTRY_IP} multipaas.com multipaas.keycloak.com multipaas.registry.com docker-registry registry.multipaas.org multipaas.static.com" >> /etc/hosts`, true);
            await OSController.sshExec(masterIpHost[0], `printf "${rPass}" | docker login registry.multipaas.org --username ${rUser} --password-stdin`, true);
            
            // Install nginx ingress controller on cluster
            await OSController.sshExec(masterIpHost[0], [
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/ns-and-sa.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/rbac/rbac.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/default-server-secret.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/nginx-config.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/vs-definition.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/vsr-definition.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/ts-definition.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/gc-definition.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/common/global-configuration.yaml`,
                `kubectl apply -f /home/vagrant/deployment_templates/ingress-controller/daemon-set/nginx-ingress.yaml`
            ], true);

            // Install local-path-provisioner on cluster
            await OSController.sshExec(masterIpHost[0], `kubectl apply -f /home/vagrant/deployment_templates/local-path-provisioner/local-path-storage.yaml`, true);
            
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
            console.log(errArray);
            let created = await this.vmExists(`master.${hash}`);
            if(created){
                await this.stopDeleteVm(`master.${hash}`, workspaceId);
            }
            if(leasedIp){
                this.mqttController.client.publish(`/multipaas/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
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
            vagrantTemplateArray = OSController.readFileToArray(path.join(process.cwd(), "resources", "templates", "worker", "Vagrantfile"));

            if(process.env.DHCP_OVERWRITE){
                let assignedIpResponse = await this.mqttController.queryRequestResponse("taskmanager", "leaseIp");
                if(!assignedIpResponse || !assignedIpResponse.data.leasedIp){
                    throw new Error("No IP could be leased");
                }
                leasedIp = assignedIpResponse.data.leasedIp;
            }
            
            let WS_HASH = "<WS_HASH>";
            let IF_NAME = "<IF_NAME>";
            let CPLANE_IP = "<CPLANE_IP>";
            let STATIC_IP = "<STATIC_IP>";
            let CPUS = "<CPUS>";
            let MP_BASE_PATH = "<MP_BASE_PATH>";

            let mcRootPath = path.normalize(path.join(process.cwd(), '../..'));

            vagrantTemplateArray = vagrantTemplateArray.map(l => {
                while(l.indexOf(WS_HASH) != -1){
                    l = `${l.substring(0, l.indexOf(WS_HASH))}${hash}${l.substring(l.indexOf(WS_HASH)+9)}`;
                }
                while(l.indexOf(IF_NAME) != -1){
                    l = `${l.substring(0, l.indexOf(IF_NAME))}${process.env.DEFAULT_INET_INTERFACE}${l.substring(l.indexOf(IF_NAME)+9)}`;
                }
                while(l.indexOf(STATIC_IP) != -1){
                    l = `${l.substring(0, l.indexOf(STATIC_IP))}${leasedIp ? ', ip: "'+leasedIp+'"' : ""}${l.substring(l.indexOf(STATIC_IP)+11)}`;
                }
                while(l.indexOf(CPLANE_IP) != -1){
                    l = `${l.substring(0, l.indexOf(CPLANE_IP))}${process.env.REGISTRY_IP}${l.substring(l.indexOf(CPLANE_IP)+11)}`;
                }
                while(l.indexOf(CPUS) != -1){
                    l = `${l.substring(0, l.indexOf(CPUS))}${os.cpus().length}${l.substring(l.indexOf(CPUS)+6)}`;
                }
                while(l.indexOf(MP_BASE_PATH) != -1){
                    l = `${l.substring(0, l.indexOf(MP_BASE_PATH))}${mcRootPath}${l.substring(l.indexOf(MP_BASE_PATH)+14)}`;
                }
                return l;
            });

            OSController.writeArrayToFile(path.join(targetFolder, "Vagrantfile"), vagrantTemplateArray);
        } catch (errorArray) {
            if (fs.existsSync(targetFolder)) {
                await rmfr(targetFolder);
            }
            if(leasedIp){
                this.mqttController.client.publish(`/multipaas/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
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
            await OSController.execMultiPaaSScript(`${provisioningScript} ${wsId.toString()} worker.${hash} ${payload.masterNode.ip} ${rUser} ${rPass}`);
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
            OSController.copyFile(path.join(process.cwd(), "resources", "scripts", "start_vm.sh"), targetFolder);
            OSController.copyFile(path.join(process.cwd(), "resources", "scripts", "stop_vm.sh"), targetFolder);
            OSController.copyFile(path.join(process.cwd(), "resources", "scripts", "destroy_vm.sh"), targetFolder);
                
            // Update hostnames with registry domain and login to registry
            // This is done here rather than from the bootstrap script because we need to fetch the workspace org credentials for the registry
            // await OSController.sshExec(workerIpHost[0], `echo "${process.env.REGISTRY_IP} multipaas.com multipaas.registry.com docker-registry registry.multipaas.org multipaas.static.com" >> /etc/hosts`, true);
            await OSController.sshExec(workerIpHost[0], `printf "${rPass}" | docker login registry.multipaas.org --username ${rUser} --password-stdin`, true);

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
                this.mqttController.client.publish(`/multipaas/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                    leasedIp: leasedIp
                }));
            }

            let bubbleUpError = new Error(Array.isArray(errArray) ? errArray.map(e => e.message).join(" ; ") : errArray.message);
            bubbleUpError.code = Array.isArray(errArray) ? 500 : (errArray.code ? errArray.code : 500);
            throw bubbleUpError;
        }
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
                    if((vmName.indexOf("master.") == 0 || vmName.indexOf("worker.") == 0) && (vmName.indexOf("master.base_") == -1 && vmName.indexOf("worker.base_") == -1)){
                        let state = await OSController.execSilentCommand(`vboxmanage showvminfo "${vmName}" | grep -e ^State`);
                        if(state.length == 1){
                            if(state[0].toLowerCase().indexOf("saved") != -1){
                                await OSController.execSilentCommand(`vboxmanage startvm ${vmName} --type headless`);
                            } else if(state[0].toLowerCase().indexOf("paused") != -1){
                                await OSController.execSilentCommand(`vboxmanage controlvm ${vmName} resume`);
                            } else if(state[0].toLowerCase().indexOf("powered") != -1){
                                await OSController.execSilentCommand(`vboxmanage startvm ${vmName} --type headless`);
                            } else if(state[0].toLowerCase().indexOf("aborted") != -1){
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
}
EngineController.inMaintenance = false;
module.exports = EngineController;