let DBController = require("../db/index");
var ping = require('ping');

class DHCPController {

    /**
     * init
     */
    static async init() {
        let gatewayMask = null
        gatewayMask = process.env.DHCP_MASK;
         
        for(let i=254; i>=2; i--){
            this.available.push(`${gatewayMask}.${i}`);
        }
       
        let ipsInUse = await DBController.getIpsInUse();
       
        if(process.env.DHCP_RESERVED){
            let skip = JSON.parse(process.env.DHCP_RESERVED).map(o => `${gatewayMask}.${o}`);
            ipsInUse = ipsInUse.concat(skip);
        }
       
        this.available = this.available.filter(o => ipsInUse.indexOf(o) == -1);
        // Ping remaining IPs and discard the once that respond.
        // INFO: This requires that hosts protected by firewalls allow a ping to happen.
        if(process.env.DHCP_USE_PING && process.env.DHCP_USE_PING.toLowerCase() == "true"){
            this.available.forEach((host) =>{
                ping.sys.probe(host, (isAlive) => {
                    if(isAlive) {
                        this.available = this.available.filter(h => h != host);
                    }
                }, {timeout: 10});
            });
        }
    }

    /**
     * leaseFreeIp
     */
    static leaseFreeIp() {
        if(this.available.length > 0){
            return this.available.shift();
        }
    }

    /**
     * returnLeasedIp
     * @param {*} ip 
     */
    static returnLeasedIp(ip) {
        ping.sys.probe(ip, (isAlive) => {
            if(!isAlive) {
                this.available.push(ip);
            }
        }, {timeout: 10});
    }
}

DHCPController.available = [];
module.exports = DHCPController;