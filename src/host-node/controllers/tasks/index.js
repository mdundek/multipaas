const TaskRuntimeController = require('./task.runtime');
const TaskGlusterController = require('./task.gluster');
const TaskServicesController = require('./task.services');
const TaskVolumeController = require('./task.volume');
const TaskAppsController = require('./task.apps');
const TaskIngressController = require('./task.ingress');

const OSController = require("../os/index");
const DBController = require("../db/index");

const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const YAML = require('yaml');

// const ssh = new node_ssh();
let EngineController;

class TaskController {
    
    /**
     * init
     */
    static init(mqttController) {
        this.mqttController = mqttController;

        // Prepare the environment scripts
        (async () => {
            this.ip = await OSController.getIp();
            if(process.env.MP_MODE != "unipaas") {
                if(process.env.CLUSTER_ENGINE == "virtualbox") {
                    EngineController = require("../engines/virtualbox/index");
                }
                await EngineController.init(this.mqttController);
            }

            TaskRuntimeController.init(this, this.mqttController);
            TaskGlusterController.init(this, this.mqttController);
            TaskServicesController.init(this, this.mqttController);
            TaskVolumeController.init(this, this.mqttController);
            TaskAppsController.init(this, this.mqttController);
            TaskIngressController.init(this, this.mqttController);

            if(process.env.MP_MODE != "unipaas") {
                setInterval(() => {
                    EngineController.ensureNodesStarted();
                }, 2 * 60 * 1000); // Every 2 minutes
                EngineController.ensureNodesStarted();

                setInterval(() => {
                    this.maintenance();
                }, 10 * 60 * 1000); // Every 10 minutes
            }
        })();
    }

    /**
     * maintenance
     */
    static async maintenance(){
        // TODO: 

        // Get all masters and workers that are suposed to be deployed on this node
        // Have DB worker node but missing Worker VM:
        //   make sure the master (wherever it is) deprovisions this worker node
        // Have DB master node but missing Master VM:
        //   Look up all worker nodes for this master, delete their VMs & DB node entries
        // Remove node DB entry
        // Create new provisioning task in DB for task controller, and fire new task event
        
        // Get all VMs from this host
        // if VM has no Node DB entry & no PENDING or IN_PROGRESS task associated to it, delete VM
    }

    /**
     * requestTakeNodeSnapshot
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestTakeNodeSnapshot(topicSplit, ip, data) {
        try{
            let snapshotName = await EngineController.takeSnapshot(data.node);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "take snapshot",
                snapshot: snapshotName
            }));
        } catch (_error) {
            console.error(_error);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message,
                task: "take snapshot"
            }));
        }   
    }

    /**
     * restoreNodeSnapshot
     * @param {*} ip 
     * @param {*} data 
     */
    static async restoreNodeSnapshot(topicSplit, ip, data) {
        try{
            await EngineController.restoreSnapshot(data.node, data.snapshot);
            if(topicSplit.length == 7){
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "restore snapshot"
                }));
            }
        } catch (_error) {
            console.error(_error);
            if(topicSplit.length == 7){
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: _error.code ? _error.code : 500,
                    message: _error.message,
                    task: "restore snapshot"
                }));
            }
        }   
    }

    /**
     * requestDeleteNodeSnapshot
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeleteNodeSnapshot(topicSplit, ip, data) {
        try{
            await EngineController.deleteSnapshot(data.node, data.snapshot);
            if(topicSplit.length == 7){
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "delete snapshot"
                }));
            }
        } catch (_error) {
            console.error(_error);
            if(topicSplit.length == 7){
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: _error.code ? _error.code : 500,
                    message: _error.message,
                    task: "delete snapshot"
                }));
            }
        }   
    }

    /**
     * requestDeployWorkspaceCluster
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeployWorkspaceCluster(topicSplit, ip, data) {
        let task = await DBController.getTaskById(data.taskId);
        task.payload = JSON.parse(task.payload);
        try {
            await this.deployWorkspaceCluster(data.socketId, ip, task.targetId);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "create workspace cluster"
            }));
        } catch (_error) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: _error.code ? _error.code : 500,
                message: _error.message ? _error.message : "An error occured",
                task: "create workspace cluster"
            }));
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
            let account = await DBController.getAccountForOrg(org.id);
            let ws = await DBController.getWorkspace(workspaceId);
            let rPass = this.decrypt(org.registryPass, org.bcryptSalt);
            if(!dbHostNode){
                throw new Error("Could not find K8SHost in database");
            }
            result = await EngineController.deployNewCluster(dbHostNode, workspaceId, org.registryUser, rPass, (eventMessage) => {
                this.mqttController.logEvent(socketId, "info", eventMessage);
            });

            let adminRoleBindingYamlPath = path.join(process.cwd(), "resources", "k8s_templates", "rbac_role_bindings.yaml");
            let wsTmpYamlPath = path.join(process.env.VM_BASE_DIR, "workplaces", ws.id.toString(), result.nodeHostname, "rbac_role_bindings.yaml");
            await OSController.copyFile(adminRoleBindingYamlPath, path.dirname(wsTmpYamlPath));
            let adminRoleBindingYaml = YAML.parse(fs.readFileSync(wsTmpYamlPath, 'utf8'));
            adminRoleBindingYaml.subjects[0].name = `/mp/${account.name}-${org.name}-${ws.name}/cluster-admin`;
            fs.writeFileSync(wsTmpYamlPath, YAML.stringify(adminRoleBindingYaml));

            await TaskRuntimeController.applyK8SYaml(wsTmpYamlPath, null, { ip: result.nodeIp });
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
                        this.mqttController.client.publish(`/multipaas/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                            leasedIp: result.leasedIp
                        }));
                    }
                } catch(_err) {
                    // TODO: Log rollback error
                    console.error(_err);
                }
            }

            throw err;
        }
    }

    /**
     * requestProvisionWorker
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async requestProvisionWorker(topicSplit, payload) {
        let result = null;
        let dbId = null;
        try {
            let org = await DBController.getOrgForWorkspace(payload.masterNode.workspaceId);
            let rPass = this.decrypt(org.registryPass, org.bcryptSalt);

            result = await EngineController.deployWorker(topicSplit, payload, org.registryUser, rPass);
            dbId = await DBController.createK8SWorkerNode(result.nodeIp, result.nodeHostname, result.workspaceId, result.hostId, result.hash);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
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
                    
                    // if(result.leasedIp){
                    //     this.mqttController.client.publish(`/multipaas/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                    //         leasedIp: result.leasedIp
                    //     }));
                    // }
                } catch(_err) {
                    // TODO: Log rollback error
                    console.error(_err);
                }
            }
            if(dbId != null) {
                await DBController.deleteK8SNode(dbId);
            }

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "provision",
                nodeType: "worker"
            }));
        }
    }

    /**
     * requestTaintMaster
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async requestTaintMaster(topicSplit, payload) {
        try {
            await TaskRuntimeController.taintMaster(payload.masterNode);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "taintMaster",
                nodeType: "master",
                node: payload.masterNode
            }));
        } catch (err) {
            console.error(err);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "taintMaster",
                nodeType: "master",
                node: payload.masterNode
            }));
        }
    }

    /**
     * requestUntaintMaster
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async requestUntaintMaster(topicSplit, payload) {
        try {
            await TaskRuntimeController.untaintMaster(payload.masterNode);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "untaintMaster",
                nodeType: "master",
                node: payload.masterNode
            }));
        } catch (err) {
            console.error(err);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "untaintMaster",
                nodeType: "master",
                node: payload.masterNode
            }));
        }
    }

    /**
     * addGitlabRunner
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async addGitlabRunner(topicSplit, payload) {
        try {
            if(payload.runnerData.type == "local-registry-runner") {
                await OSController.sshExec(payload.node.ip, `gitlab-runner register --non-interactive --url "http://${process.env.GITLAB_IP}:8929/" --registration-token "${payload.runnerData.token}" --executor "shell" --name "local-registry-runner" --run-untagged="true" --locked="true" --tag-list "local-registry"`, true);
            } else {
                // TODO
            }

            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "addGitlabRunner"
            }));
        } catch (err) {
            console.error(err);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "addGitlabRunner"
            }));
        }
    }

    /**
     * decrypt
     * @param {*} pass 
     * @param {*} salt 
     */
    static decrypt(encryptedVal, salt) {
        let iv = Buffer.from(salt, 'base64');
        let encryptedText = Buffer.from(encryptedVal, 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(process.env.CRYPTO_KEY, 'base64'), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    /**
     * requestDeleteWorkspaceFile
     * @param {*} topicSplit 
     * @param {*} ip 
     * @param {*} data 
     */
    static async requestDeleteWorkspaceFile(topicSplit, ip, data) {
        let tFile = path.join(process.env.VM_BASE_DIR, "workplaces", data.node.workspaceId.toString(), data.node.hostname, data.fileName);
        try {
            await OSController.execSilentCommand(`rm -rf ${tFile}`);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "delete file",
                data: data
            }));
        } catch (err) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: err.code ? err.code : 500,
                message: err.message,
                task: "delete file",
                data: data
            }));
        }
    }

    /**
     * detatch_worker
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async requestDetatchWorker(topicSplit, payload) {
        try {
            await TaskRuntimeController.detatchWorker(payload.masterNode, payload.workerNode);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: 200,
                task: "detatch",
                nodeType: "worker",
                node: payload.workerNode
            }));
        } catch (err) {
            console.error(err);
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "detatch",
                nodeType: "worker",
                node: payload.workerNode
            }));
        }
    }

    /**
     * requestDeprovisionWorker
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async requestDeprovisionWorker(topicSplit, payload) {
        try {
            let exists = await EngineController.vmExists(payload.workerNode.hostname);
            if(exists){
                await EngineController.stopDeleteVm(payload.workerNode.hostname, payload.workerNode.workspaceId);

                // this.mqttController.client.publish(`/multipaas/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                //     leasedIp: payload.workerNode.ip
                // }));
                
                await DBController.deleteK8SNode(payload.workerNode.id);
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "deprovision",
                    nodeType: "worker",
                    node: payload.workerNode
                }));
            } else {
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 404,
                    task: "deprovision",
                    nodeType: "worker",
                    node: payload.workerNode
                }));
            }
        } catch (err) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "deprovision",
                nodeType: "worker",
                node: payload.workerNode
            }));
        }
    }

    /**
     * requestDeprovisionMaster
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static async requestDeprovisionMaster(topicSplit, payload) {
        try {
            let exists = await EngineController.vmExists(payload.node.hostname);
            if(exists){
                await EngineController.stopDeleteVm(payload.node.hostname, payload.node.workspaceId);

                // this.mqttController.client.publish(`/multipaas/k8s/host/query/taskmanager/returnLeasedIp`, JSON.stringify({
                //     leasedIp: payload.node.ip
                // }));
                
                await DBController.deleteK8SNode(payload.node.id);
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    task: "deprovision",
                    nodeType: "worker",
                    node: payload.node
                }));
            } else {
                this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 404,
                    task: "deprovision",
                    nodeType: "worker",
                    node: payload.node
                }));
            }
        } catch (err) {
            this.mqttController.client.publish(`/multipaas/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                status: Array.isArray(err) ? 500 : (err.code ? err.code : 500),
                message: Array.isArray(err) ? err.map(e => e.message).join(" ; ") : err.message,
                task: "deprovision",
                nodeType: "worker",
                node: payload.node
            }));
        }
    }
}
TaskController.ip = null;
module.exports = TaskController;