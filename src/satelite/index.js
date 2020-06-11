const path = require("path");

global.appRoot = path.resolve(__dirname);

let MqttController = require("./controllers/mqtt/index");

require('dotenv').config();

MqttController.init();