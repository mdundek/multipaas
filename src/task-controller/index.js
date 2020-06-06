let MqttController = require("./controllers/mqtt/index");
let TaskController = require("./controllers/tasks/index");
let DBController = require("./controllers/db/index");
let DHCPController = require("./controllers/dhcp/index");

require('dotenv').config();

(async() => {
    MqttController.init();
    TaskController.init(MqttController);
    DBController.init();
    if(process.env.DHCP_OVERWRITE && process.env.DHCP_OVERWRITE.toLowerCase() == "true"){
        await DHCPController.init();
    }
})();