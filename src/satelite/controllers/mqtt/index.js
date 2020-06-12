const mqtt = require('mqtt');
const OsController = require("../os/index.js");
const shortid = require('shortid');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

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
                this.client.subscribe(`/unipaas/local/host/query/${this.ip}/#`);
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
        
        try {
            let payload = JSON.parse(message.toString());
            try {
                let stdoutArray = await OsController.execSilentCommand(payload.cmd);
                this.client.publish(`/unipaas/local/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: 200,
                    data: stdoutArray
                }));
            } catch (error) {
                console.log(error);
                this.client.publish(`/unipaas/local/host/respond/${payload.queryTarget}/${topicSplit[5]}/${topicSplit[6]}`, JSON.stringify({
                    status: error.code ? error.code : 500,
                    message: error.message
                }));
            }
        } catch (error) {
            console.error(error);
        }
    }
}
MqttController.online = false;
MqttController.client = null;

module.exports = MqttController;