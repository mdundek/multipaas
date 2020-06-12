const shortid = require('shortid');
const io = require('socket.io')();
const OsController = require('../os/index');

class EventsController {
    

    /**
     * init
     */
    static init(app, mqttController) {
        this.app = app;
        this.mqttController = mqttController;

        this.deploymentStatus = {};

        io.on('connection', client => {
            this.clients[client.id] = client;
            // client.on('event', data => { 
            //     console.log("Incomming client message " + client.id);
            // });
            client.on('disconnect', () => { 
                delete this.clients[client.id];
            });
        });
    
        io.listen(3000);
    }

    /**
     * onEvent
     * @param {*} socketId 
     * @param {*} event 
     */
    static onEvent(socketId, type, event) {
        if(this.clients[socketId]){
            if(type == "info"){
                this.clients[socketId].emit('event', event);
            } else if(type == "error"){
                event.error = true;
                this.clients[socketId].emit('event', event);
            } else {
                this.clients[socketId].disconnect();
            }
        }
    }

    /**
     * onClusterEvent
     * @param {*} hostName 
     * @param {*} event 
     */
    static onClusterEvent(hostName, event) {
        let _cells = event.split("  ").filter(o => o.length > 0).map(o => {o = o.trim();return o;});
        let obj = {};
        if(_cells[0].indexOf("D:") == 0) {
            for(let i=0; i<_cells.length; i++) {
                switch(i) {
                    case 0:
                        obj.ns = _cells[i].substring(2);
                        break;
                    case 1:
                        obj.deployment = _cells[i];
                        break;
                    case 2:
                        obj.ready = _cells[i];
                        break;
                    case 3:
                        obj.utd = parseInt(_cells[i]);
                        break;
                    case 4:
                        obj.available = parseInt(_cells[i]);
                        break;
                    case 5:
                        obj.age = _cells[i];
                        break;
                    case 6:
                        obj.containers = _cells[i];
                        break;
                    case 7:
                        obj.images = _cells[i];
                        break;
                    case 8:
                        obj.selector = _cells[i];
                        break;
                }
            }
        } else if(_cells[0].indexOf("S:") == 0) {
            for(let i=0; i<_cells.length; i++) {
                switch(i) {
                    case 0:
                        obj.ns = _cells[i].substring(2);
                        break;
                    case 1:
                        obj.deployment = _cells[i];
                        break;
                    case 2:
                        obj.ready = _cells[i];
                        break;
                    case 3:
                        obj.age = _cells[i];
                        break;
                    case 4:
                        obj.containers = _cells[i];
                        break;
                    case 5:
                        obj.images = _cells[i];
                        break;
                }
            }
        }
        
        if(obj.ns != "namespace" && obj.deployment != "name") {
            if(!this.deploymentStatus[hostName]) {
                this.deploymentStatus[hostName] = [];
            }
            this.deploymentStatus[hostName] = this.deploymentStatus[hostName].filter(o => o.deployment != obj.deployment);
            this.deploymentStatus[hostName].push(obj);
        }
        // console.log(JSON.stringify(this.deploymentStatus, null, 4));
    }
}
EventsController.clients = {};
module.exports = EventsController;