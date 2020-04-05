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
}
EventsController.clients = {};
module.exports = EventsController;