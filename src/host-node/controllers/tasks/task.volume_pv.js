const OSController = require("../os/index");
const DBController = require("../db/index");
const shortid = require('shortid');
const path = require('path');
const YAML = require('yaml');
const fs = require('fs');
shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

// const ssh = new node_ssh();
let EngineController;

class TaskPvVolumeController {
    
    /**
     * init
     */
    static init(parent, mqttController) {
        this.parent = parent;
        this.mqttController = mqttController;

        // Prepare the environment scripts
        if(process.env.CLUSTER_ENGINE == "virtualbox") {
            EngineController = require("./engines/vb/index");
        }
    }

   
}
TaskPvVolumeController.ip = null;
module.exports = TaskPvVolumeController;