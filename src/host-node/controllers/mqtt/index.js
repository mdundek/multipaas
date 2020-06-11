const mqtt = require('mqtt');
const TaskController = require('../tasks/index');
const OsController = require("../os/index.js");
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

const TaskRuntimeController = require('../tasks/task.runtime');
const TaskIngressController = require('../tasks/task.ingress');
const TaskGlusterController = require('../tasks/task.gluster');
const TaskVolumeController = require('../tasks/task.volume');
const TaskServicesController = require('../tasks/task.services');
const TaskAppsController = require('../tasks/task.apps');

class MqttController {

    /**
     * init
     */
    static init() {
        OsController.getIp().then((ip) => {
            this.ip = ip;
            var options = {
                port: process.env.MOSQUITTO_PORT,
                host: `mqtt://${process.env.MOSQUITTO_IP}`,
                encoding: 'utf8',
                keepalive: 3,
                reconnectPeriod: 1000 * 3
            };
            this.client = mqtt.connect(options.host, options);
            this.client.on('connect', () => {
                console.log("Connected");

                this.online = true;
               
                this.client.subscribe(`/multipaas/k8s/host/query/${this.ip}/#`);
                this.client.subscribe(`/multipaas/k8s/host/respond/${this.ip}/#`);

                if(process.env.IS_K8S_NODE.toLowerCase() == "true"){
                    this.client.subscribe(`/multipaas/k8s/host/query/k8s_nodes/#`);
                }
                if(process.env.IS_GLUSTER_PEER.toLowerCase() == "true"){
                    this.client.subscribe(`/multipaas/k8s/host/query/gluster_peers/#`);
                }

                this.client.subscribe(`/unipaas/node/cmd/response/${this.ip}/#`);
                
                (async() => {
                    let testLs = await this.unipaasQueryRequestResponse("192.168.1.96", "cmd", {
                        cmd: "ls -l"
                    });
                    console.log(testLs);
                })();
                



            });
            
            this.client.on('offline', () => {
                this.online = false;
            });
            
            this.client.on('message', this._processIncommingMessage.bind(this));
        }).catch(error => {
            console.error(error);
            process.exit(1);
        });
    }

    /**
     * processIncommingMessage
     * @param {*} topic 
     * @param {*} message 
     */
    static async _processIncommingMessage(topic, message) {
        let topicSplit = topic.split("/");
        if(topicSplit[0].length == 0)
            topicSplit.shift();
            
        // If message is not expected by another local task process 
        if(!this.expected(topicSplit, message)){
            try {
                let queryBase = `/multipaas/k8s/host/query/${this.ip}`;
               
                if(topic.startsWith("/multipaas/k8s/host/query/k8s_nodes/free_memory")){
                    let freeMem = await OsController.getFreeMemory();
                    let data = JSON.parse(message.toString());
                    this.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                        status: 200,
                        memory: freeMem,
                        ip: await OsController.getIp(),
                        hostname: OsController.getHostname()
                    }));
                }
                else if(topic.startsWith("/unipaas/cmd/response/")){
                    console.log("MQTT =>" + message.toString());
                }
                else if(topic.startsWith("/multipaas/k8s/host/query/k8s_nodes/free_disk_size") || topic.startsWith("/multipaas/k8s/host/query/gluster_peers/free_disk_size")){
                    let totalDiskSpace = await OsController.getVolumeStorageTotalSpace();
                    
                    // TODO: Get all host volumes from db and calculate total usage (there is a function in DBController called "getGlusterHostVolumes").
                    // Substract that from the total free disk space
                    // Substract used space in the folder reserved for VM dedicated storages 
                    let data = JSON.parse(message.toString());
                    this.client.publish(`/multipaas/k8s/host/respond/${data.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                        status: 200,
                        space: totalDiskSpace,
                        ip: await OsController.getIp(),
                        hostname: OsController.getHostname()
                    }));
                }
                else if(topic.startsWith(`${queryBase}/trigger_deployment_status_events`)){
                    await TaskRuntimeController.requestTriggerDeploymentStaustEvents(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/deploy_k8s_cluster`)){
                    await TaskController.requestDeployWorkspaceCluster(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/provision_gluster_volume`)){
                    await TaskGlusterController.requestProvisionGlusterVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/take_node_snapshot`)){
                    await TaskController.requestTakeNodeSnapshot(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/restore_node_snapshot`)){
                    await TaskController.restoreNodeSnapshot(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/delete_node_snapshot`)){
                    await TaskController.requestDeleteNodeSnapshot(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/deprovision_gluster_volume`)){
                    await TaskGlusterController.requestDeprovisionGlusterVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/detatch_local_volume_from_vm`)){
                    await TaskVolumeController.requestDetatchLocalVolumeFromVM(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/delete_local_volume`)){
                    await TaskVolumeController.requestDeleteLocalVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/deprovision_pvc`)){
                    await TaskRuntimeController.requestRemoveK8SPersistantVolumeClaim(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/deprovision_pv`)){
                    await TaskRuntimeController.requestRemoveK8SPersistantVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/delete_gluster_volume_dir`)){
                    let data = JSON.parse(message.toString())
                    await TaskGlusterController.requestDeleteDeprovisionnedGlusterDir(data.name, data.secret);
                }
                else if(topic.startsWith(`${queryBase}/mount_gluster_volume`)){
                    await TaskGlusterController.requestMountK8SNodeGlusterVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/attach_local_volume_to_vm`)){
                    await TaskVolumeController.requestAttachLocalVolumeToVM(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/get_k8s_resources`)){
                    await TaskRuntimeController.requestGetK8sResources(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/get_k8s_resource_values`)){
                    await TaskRuntimeController.requestGetK8SResourceValues(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/get_k8s_helm_deployments`)){
                    await TaskRuntimeController.requestGetHelmDeployments(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/create_k8s_resource`)){
                    await TaskRuntimeController.requestCreateK8SResource(topicSplit, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/unmount_gluster_volume`)){
                    await TaskGlusterController.requestUnmountK8SNodeGlusterVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/unmount_local_volume`)){
                    await TaskVolumeController.requestUnmountK8SNodeLocalVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/mount_local_volume`)){
                    await TaskVolumeController.requestMountK8SNodeLocalVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/delete_workspace_file`)){
                    await TaskController.requestDeleteWorkspaceFile(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/set_gluster_authorized_ips`)){
                    await TaskGlusterController.requestAuthorizeGlusterVolumeIps(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/deploy_k8s_persistant_volume_claim`)){ // Order matters here
                    await TaskRuntimeController.requestDeployK8SPersistantVolumeClaim(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/deploy_k8s_persistant_volume`)){
                    await TaskRuntimeController.requestDeployK8SPersistantVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/deploy_k8s_service`)){
                    await TaskServicesController.requestDeployK8SService(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/create_pv_directory`)){
                    await TaskServicesController.requestCreateServicePvDir(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/delete_k8s_service`)){
                    await TaskServicesController.requestDeleteK8SService(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/delete_k8s_application_version`)){
                    await TaskAppsController.requestDeleteK8SApplicationVersion(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/scale_application`)){
                    await TaskAppsController.requestScaleApplicationVersion(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/remove_k8s_all_pv_for_volume`)){
                    await TaskRuntimeController.requestRemoveK8SAllPvForVolume(topicSplit, this.ip, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/detatch_worker`)) { // Expects response
                    await TaskController.requestDetatchWorker(topicSplit, JSON.parse(message.toString()));
                } 
                else if(topic.startsWith(`${queryBase}/deprovision_worker`)) { // Expects response
                    await TaskController.requestDeprovisionWorker(topicSplit, JSON.parse(message.toString()));
                } 
                else if(topic.startsWith(`${queryBase}/deprovision_master`)) { // Expects response
                    await TaskController.requestDeprovisionMaster(topicSplit, JSON.parse(message.toString()));
                } 
                else if(topic.startsWith(`${queryBase}/provision_worker`)) { // Expects response
                    await TaskController.requestProvisionWorker(topicSplit, JSON.parse(message.toString()));
                } 
                else if(topic.startsWith(`${queryBase}/taint_master`)) { // Expects response
                    await TaskController.requestTaintMaster(topicSplit, JSON.parse(message.toString()));
                } 
                else if(topic.startsWith(`${queryBase}/untaint_master`)) { // Expects response
                    await TaskController.requestUntaintMaster(topicSplit, JSON.parse(message.toString()));
                } 
                else if(topic.startsWith(`${queryBase}/get_k8s_config`)) {
                    await TaskRuntimeController.requestGrabMasterConfigFile(topicSplit, JSON.parse(message.toString()));
                } 
                else if(topic.startsWith(`${queryBase}/get_k8s_state`)) {
                    await TaskRuntimeController.requestGetK8sState(topicSplit, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/build_publish_k8s_image`)) {
                    await TaskAppsController.requestBuildPublishImage(topicSplit, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/list_org_registry_images`)) {
                    await TaskAppsController.requestGetOrgRegistryImages(topicSplit, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/delete_k8s_image`)) {
                    await TaskAppsController.requestDeleteRegistryImages(topicSplit, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/update_cluster_ingress`)) {
                    await TaskIngressController.requestUpdateClusterIngressRules(topicSplit, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/update_cluster_pod_presets`)) {
                    await TaskRuntimeController.requestUpdateClusterPodPresets(topicSplit, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/add_gitlab_runner`)) {
                    await TaskController.addGitlabRunner(topicSplit, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/deploy_new_app`)) {
                    await TaskAppsController.requestDeployNewApp(topicSplit, JSON.parse(message.toString()));
                }
                else if(topic.startsWith(`${queryBase}/rollback_k8s_resources`)) {
                    await TaskRuntimeController.requestRollbackK8SConfigs(topicSplit, JSON.parse(message.toString()));
                }
            } catch (error) {
                console.error(error);
            }
        }
    }

    /**
     * expected
     * @param {*} topicSplit 
     * @param {*} payload 
     */
    static expected(topicSplit, message) {
        if(topicSplit.length >= 7){
            if(topicSplit[3] == "respond" && this.pendingResponses[topicSplit[6]]){
                if(this.pendingResponses[topicSplit[6]].type == "collect"){
                    this.pendingResponses[topicSplit[6]].payloads.push({
                        "topicSplit": topicSplit,
                        "data": message ? JSON.parse(message.toString()) : null
                    });
                } else if(this.pendingResponses[topicSplit[6]].type == "respond"){
                    clearTimeout(this.pendingResponses[topicSplit[6]].timeout);
                    this.pendingResponses[topicSplit[6]].resolve({
                        "topicSplit": topicSplit,
                        "data": message ? JSON.parse(message.toString()) : null
                    });
                    delete this.pendingResponses[topicSplit[6]];
                }
                return true;
            }
        }
        return false;
    }

    /**
     * logEvent
     * @param {*} socketId 
     * @param {*} type 
     * @param {*} value 
     */
    static logEvent(socketId, type, value) {
        this.client.publish(`/multipaas/cli/event/${type}/${socketId}`, JSON.stringify({
            value: value
        }));
    }

    /**
     * closeEventStream
     * @param {*} socketId 
     */
    static closeEventStream(socketId) {
        this.client.publish(`/multipaas/cli/event/done/${socketId}`, JSON.stringify({}));
    }

    /**
     * queryRequestResponse
     * @param {*} targetHost 
     * @param {*} task 
     * @param {*} payload 
     * @param {*} timeout 
     */
    static queryRequestResponse(targetHost, task, payload, timeout) {
        return new Promise((resolve, reject) => {
            let requestId = null;
            while(requestId == null){
                requestId = shortid.generate();
                if(requestId.indexOf("$") != -1 || requestId.indexOf("@") != -1){
                    requestId = null;
                }
            }
            this.pendingResponses[requestId] = {
                "type": "respond", 
                "resolve": resolve,
                "reject": reject,
                "timeout": setTimeout(function(requestId) {
                    if(this.pendingResponses[requestId]){
                        this.pendingResponses[requestId].reject(new Error("Request timed out"));
                        delete this.pendingResponses[requestId];
                    }
                }.bind(this, requestId), timeout ? timeout : 6000)
            };

            OsController.getIp().then(thisIp => {
                if(!payload){
                    this.client.publish(`/multipaas/k8s/host/query/${targetHost}/${task}/${requestId}`, JSON.stringify({
                        queryTarget: thisIp
                    }));
                } else {
                    payload.queryTarget = thisIp;
                    this.client.publish(`/multipaas/k8s/host/query/${targetHost}/${task}/${requestId}`, JSON.stringify(payload));
                }
            }).catch(err => {
                clearTimeout(this.pendingResponses[requestId].timeout);
                delete this.pendingResponses[requestId];
                reject(err);
            })
        });
    }


    /**
     * unipaasQueryRequestResponse
     * @param {*} targetHost 
     * @param {*} task 
     * @param {*} payload 
     * @param {*} timeout 
     */
    static unipaasQueryRequestResponse(targetHost, task, payload, timeout) {
        return new Promise((resolve, reject) => {
            let requestId = null;
            while(requestId == null){
                requestId = shortid.generate();
                if(requestId.indexOf("$") != -1 || requestId.indexOf("@") != -1){
                    requestId = null;
                }
            }
            this.pendingResponses[requestId] = {
                "type": "respond", 
                "resolve": resolve,
                "reject": reject,
                "timeout": setTimeout(function(requestId) {
                    if(this.pendingResponses[requestId]){
                        this.pendingResponses[requestId].reject(new Error("Request timed out"));
                        delete this.pendingResponses[requestId];
                    }
                }.bind(this, requestId), timeout ? timeout : 6000)
            };

            OsController.getIp().then(thisIp => {
                if(!payload){
                    this.client.publish(`/unipaas/local/host/query/${targetHost}/${task}/${requestId}`, JSON.stringify({
                        queryTarget: thisIp
                    }));
                } else {
                    payload.queryTarget = thisIp;
                    this.client.publish(`/unipaas/local/host/query/${targetHost}/${task}/${requestId}`, JSON.stringify(payload));
                }
            }).catch(err => {
                clearTimeout(this.pendingResponses[requestId].timeout);
                delete this.pendingResponses[requestId];
                reject(err);
            })
        });
    }
}
MqttController.pendingResponses = {};
MqttController.online = false;
MqttController.client = null;

module.exports = MqttController;