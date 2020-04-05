const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const shortid = require('shortid');
const OsController = require('../os/index');
const EventsController = require('../events/index');

class MqttController {

    /**
     * init
     */
    static init(app) {
        this.app = app;
        var options = {
            port: process.env.MOSQUITTO_PORT,
            host: `mqtt://${process.env.MOSQUITTO_IP}`,
            encoding: 'utf8',
            keepalive: 3,
            reconnectPeriod: 1000 * 3
        };
        this.client = mqtt.connect(options.host, options);

        this.client.on('connect', () => {
            this.online = true;
            this.client.subscribe(`/mycloud/k8s/host/query/api/#`);
            this.client.subscribe(`/mycloud/k8s/host/respond/#`);         
            this.client.subscribe(`/mycloud/cli/event/#`);         
        });
        
        this.client.on('offline', () => {
            this.online = false;
        });

        this.services = YAML.parse(fs.readFileSync("/usr/src/app/data/mc_services/available.yml", 'utf8'));
        this.client.on('message', this._processIncommingMessage.bind(this));
    }

    /**
     * processIncommingMessage
     * @param {*} topic 
     * @param {*} message 
     */
    static _processIncommingMessage(topic, message) {
        let topicSplit = topic.split("/");
        if(topicSplit[0].length == 0)
            topicSplit.shift();

        // If message is a process event
        if(topic.indexOf("/mycloud/cli/event/") == 0) {
            EventsController.onEvent(topicSplit[4], topicSplit[3], JSON.parse(message.toString()));
        }
        // If message is not expected by another local task process 
        else if(!this.expected(topicSplit, message)){
            if(topic.startsWith("/mycloud/k8s/host/query/api/get_chart_binary/")){
                try {
                    let data = JSON.parse(message.toString());
                    let targetService = this.services[data.service].versions.find(o => o.version == data.version);
                    let helmChartData = fs.readFileSync(path.join(global.appRoot, "..", "..", "..", "mc_services", "charts", targetService.chartFile));

                    let base64Encoded = helmChartData.toString('base64');
                    this.client.publish(`/mycloud/k8s/host/respond/api/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                        status: 200,
                        task: "get chart binary",
                        data: base64Encoded
                    }));
                } catch (error) {
                    console.log("ERROR =>", error);
                    this.client.publish(`/mycloud/k8s/host/respond/api/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                        status: error.code ? error.code : 500,
                        message: error.message,
                        task: "get chart binary"
                    }));
                }
            } else if(topic.startsWith("/mycloud/k8s/host/query/api/get_services_config/")){
                try {
                    this.client.publish(`/mycloud/k8s/host/respond/api/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                        status: 200,
                        services: this.services
                    }));
                } catch (error) {
                    console.log("ERROR =>", error);
                    this.client.publish(`/mycloud/k8s/host/respond/api/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                        status: error.code ? error.code : 500,
                        message: error.message,
                        task: "get chart binary"
                    }));
                }
            } else if(topic.startsWith("/mycloud/k8s/host/query/api/get_app_source_zip/")){
                let data = JSON.parse(message.toString());
                fs.readFile(data.zipPath, (err, zipData) => {
                    if (err) {
                        console.log("ERROR =>", err);
                        return this.client.publish(`/mycloud/k8s/host/respond/api/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                            status: err.code ? err.code : 500,
                            message: err.message,
                            task: "get chart binary"
                        }));
                    }
                    if(data.delete) {
                        fs.unlinkSync(data.zipPath);
                    }
                    this.client.publish(`/mycloud/k8s/host/respond/api/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                        status: 200,
                        task: "get chart binary",
                        data: zipData.toString('base64')
                    }));
                });
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
     * queryRequestResponse
     * @param {*} targetHostIp 
     * @param {*} taskName 
     * @param {*} payload 
     * @param {*} timeout 
     */
    static queryRequestResponse(targetHostIp, taskName, payload, timeout) {
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
                }.bind(this, requestId), timeout ? timeout : 3000)
            };

            if(!payload){
                this.client.publish(`/mycloud/k8s/host/query/${targetHostIp}/${taskName}/${requestId}`, JSON.stringify({
                    queryTarget: "api"
                }));
            } else {
                payload.queryTarget = "api";
                this.client.publish(`/mycloud/k8s/host/query/${targetHostIp}/${taskName}/${requestId}`, JSON.stringify(payload));
            }
        });
    }

    // /**
    //  * _lookForPendingSyncRequests
    //  * @param {*} topicSplit 
    //  * @param {*} message 
    //  */
    // static _lookForPendingSyncRequests(topicSplit, message) {
    //     // let example = "<ip>/<task>/sessionid>";
    //     if(this.requestSessions[topicSplit[2]]) {
    //         clearTimeout(this.requestSessions[topicSplit[1]].timeout);
    //         let payload = JSON.parse(message);
    //         if(payload.code == 200) {
    //             this.requestSessions[topicSplit[1]].resolve(payload.data);
    //         } else {
    //             this.requestSessions[topicSplit[1]].reject(payload.data);
    //         }
    //         delete this.requestSessions[topicSplit[1]];
    //         return true;
    //     }
    //     return false;
    // }

    // /**
    //  * k8sSyncRequest
    //  * @param {*} hostIp 
    //  * @param {*} task 
    //  * @param {*} params 
    //  */
    // static k8sSyncRequest(hostIp, task, params) {
    //     return new Promise((resolve, reject) => {
    //         let sessionId = shortid.generate();
    //         this.requestSessions[sessionId] = {
    //             "resolve": resolve,
    //             "reject": reject,
    //             "timeout": setTimeout(function(sessionId) {
    //                 if(this.requestSessions[sessionId]){
    //                     this.requestSessions[sessionId].reject(new Error("TIMEOUT"));
    //                     delete this.requestSessions[sessionId];
    //                 }
    //             }.bind(this, sessionId), 5000)
    //         };
    //         this.client.publish(`/mycloud/k8s/host/query/${hostIp}/${task}/${sessionId}`, params ? JSON.stringify(params) : null);
    //     });  
    // }

    /**
     * notifyNewTask
     * @param {*} id 
     */
    static notifyNewTask(id) {
        if(this.online){
            this.client.publish(`/mycloud/task/new/${id}`);
        } else {
            console.log("MQTT Offline");
        }
    }
}

MqttController.pendingResponses = {};
MqttController.online = false;
MqttController.client = null;
MqttController.app = null;

module.exports = MqttController;