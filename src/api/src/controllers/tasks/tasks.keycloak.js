const Keycloak = require('../../lib/keycloak');

class TaskKeycloakController {

    /**
     * init
     */
    static init(parent, app, mqttController) {
        this.parent = parent;
        this.app = app;
        this.mqttController = mqttController;
    }

    /**
     * processScheduledCreateGroups
     * @param {*} task 
     */
    static async getAvailableClusterGroups(data, params) {
        try {
            let adminToken = await Keycloak.adminAuthenticate(this.app);
            let groups = await Keycloak.getAvailableClusterGroups(adminToken, `${data.accName}-${data.orgName}-${data.wsName}`);

            return { "code": 200, "data": groups };
        } catch (error) {
            console.log(error);
            return { "code": 500 };
        }
    }

    /**
     * getGroupsForUsers
     * @param {*} data 
     * @param {*} params 
     */
    static async getGroupsForUsers(data, params) {
        params._internalRequest = true;
        let org = await this.app.service("organizations").get(data.organizationId, params);
        params._internalRequest = true;
        let acc = await this.app.service("accounts").get(org.accountId, params);

        let adminToken = await Keycloak.adminAuthenticate(this.app);
        let groupData = {};
        for(let i=0; i<data.emails.length; i++) {
            let _data = await Keycloak.getUserGroupsForOrg(
                adminToken,
                `${acc.name}-${org.name}-`,
                data.emails[i]
            );
            groupData[data.emails[i]] = _data;
        }
       
        return { "code": 200, "data": groupData }
    }
    

    /**
     * applyRbacBindings
     * @param {$} data 
     * @param {*} params 
     */
    static async applyRbacBindings(data, params) {
        let r = await this.parent._precheckWorkspaceReadyNotBussy(data.workspaceId, params);
        if(r.code){
            return r;
        }

        // We start by deleting all cluster groups for those users before we reassign the selecteg groups
        params._internalRequest = true;
        let ws = await this.app.service("workspaces").get(data.workspaceId, params);
        params._internalRequest = true;
        let org = await this.app.service("organizations").get(ws.organizationId, params);
        params._internalRequest = true;
        let acc = await this.app.service("accounts").get(org.accountId, params);

        let adminToken = await Keycloak.adminAuthenticate(this.app);
        for(let i=0; i<data.emails.length; i++) {
            await Keycloak.removeClusterBaseGroupsForUser(
                adminToken,
                `${acc.name}-${org.name}-${ws.name}`,
                data.emails[i]
            );
        }

        // Now we assign the proper groups
        for(let i=0; i<data.emails.length; i++) {
            for(let y=0; y<data.groups.length; y++) {
                await Keycloak.addClusterGroupToUser(
                    adminToken,
                    data.emails[i],
                    `${acc.name}-${org.name}-${ws.name}`,
                    data.groups[y]
                );
            }
        }
        return { "code": 200 }
    }
}
module.exports = TaskKeycloakController;