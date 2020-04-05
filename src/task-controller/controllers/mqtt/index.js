const mqtt = require('mqtt');
const DBController = require('../db/index');
const OsController = require("../os/index.js");
const TaskController = require('../tasks/index');
const DHCPController = require('../dhcp/index');
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

class MqttController {

    /**
     * init
     */
    static init() {
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
            this.client.subscribe(`/mycloud/alert/#`);
            this.client.subscribe(`/mycloud/task/new/#`);
            this.client.subscribe(`/mycloud/k8s/host/respond/#`);
            this.client.subscribe(`/mycloud/k8s/host/query/taskmanager/#`);
            
        });
        
        this.client.on('offline', () => {
            this.online = false;
        });
        
        this.client.on('message', this._processIncommingMessage.bind(this));
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
            // If notification of a new task for the controller
            if(topic.startsWith("/mycloud/alert/")){
                console.error("ALERT =>", topic);
            } else if(topic.startsWith("/mycloud/task/new/")){
                let taskId = topicSplit[3];
                if(taskId.length > 0 && !isNaN(taskId)){
                    TaskController.processPendingTasks(taskId);
                }
            } else if(topic.startsWith("/mycloud/k8s/host/query/taskmanager/")){
                if(topicSplit[5] == "leaseIp"){
                    let freeIp = DHCPController.leaseFreeIp();
                    let payload = JSON.parse(message.toString());
                    this.client.publish(`/mycloud/k8s/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                        "leasedIp": freeIp
                    }));
                } else if(topicSplit[5] == "returnLeasedIp"){
                    let payload = JSON.parse(message.toString());
                    DHCPController.returnLeasedIp(payload.leasedIp);
                }
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
        this.client.publish(`/mycloud/cli/event/${type}/${socketId}`, JSON.stringify({
            value: value
        }));
    }

    /**
     * closeEventStream
     * @param {*} socketId 
     */
    static closeEventStream(socketId) {
        this.client.publish(`/mycloud/cli/event/done/${socketId}`, JSON.stringify({}));
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
                }.bind(this, requestId), timeout ? timeout : 3000)
            };
           
            if(!payload){
                this.client.publish(`/mycloud/k8s/host/query/${targetHost}/${task}/${requestId}`, JSON.stringify({
                    queryTarget: "taskmanager"
                }));
            } else {
                payload.queryTarget = "taskmanager";
                this.client.publish(`/mycloud/k8s/host/query/${targetHost}/${task}/${requestId}`, JSON.stringify(payload));
            }
        });
    }

    /**
     * collectRequestResponse
     * @param {*} topic 
     */
    static collectRequestResponse(topic) {
        return new Promise((resolve, reject) => {
            try{
                let requestId = null;
                while(requestId == null){
                    requestId = shortid.generate();
                    if(requestId.indexOf("$") != -1 || requestId.indexOf("@") != -1){
                        requestId = null;
                    }
                }
                this.pendingResponses[requestId] = {"type": "collect", "payloads": []};
                setTimeout(function (requestId) {
                    let dataArray = this.pendingResponses[requestId].payloads.map(o => o.data);
                    resolve(dataArray);
                    delete this.pendingResponses[requestId];
                }.bind(this, requestId), 3000);
                this.client.publish(`${topic}/${requestId}`);
            } catch(err) {
                reject(err);
            }
        });
    }
}

MqttController.pendingResponses = {};
MqttController.online = false;
MqttController.client = null;

module.exports = MqttController;