const request = require("request");
const jwtDecode = require('jwt-decode');
const DBController = require('../db/index');

var authOptions = {
	method: 'POST',
	url: 'https://multipaas.keycloak.com/auth/realms/master/protocol/openid-connect/token',
	headers: {'Content-Type': 'application/x-www-form-urlencoded'},
	form: {
		grant_type: 'password',
		client_id: 'kubernetes-cluster'
	},
	strictSSL: false
};
var queryOptions = {
	method: 'GET',
	url: 'https://multipaas.keycloak.com/auth/admin/realms/master',
	headers: {'Content-Type': 'application/x-www-form-urlencoded'},
	strictSSL: false
};

var createOptions = {
	method: 'POST',
	url: 'https://multipaas.keycloak.com/auth/admin/realms/master',
	headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
	strictSSL: false
};

var deleteOptions = {
	method: 'DELETE',
	url: 'https://multipaas.keycloak.com/auth/admin/realms/master',
	headers: {},
	strictSSL: false
};

var putOptions = {
	method: 'PUT',
	url: 'https://multipaas.keycloak.com/auth/admin/realms/master',
	headers: {},
	strictSSL: false
};

var createUserOptions = {
	method: 'POST',
	url: 'https://multipaas.keycloak.com/auth/admin/realms/master/users',
	headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
	strictSSL: false
};

class Keycloak {

    /**
     * asyncRequest
     * @param {*} opt 
     */
    static asyncRequest(opt) {
        return new Promise((resolve, reject) => {
            request(opt, (error, response, body) => {
                if(error) {
                    reject(error);
                } else if (response.statusCode == 401) {
                    reject(new Error('Unauthorized'));
                } else if (response.statusCode < 200 || response.statusCode > 299) {
                    reject(new Error("Unexpected error"));
                } else {
                    try {
                        let _body = JSON.parse(body);
                        resolve(_body);
                    } catch (error) {
                        resolve();
                    }
                }
            });
        });
    }

    /**
     * authenticate
     * @param {*} email 
     * @param {*} password 
     */
    static async authenticate(email, password, ignoreMissingRoles) {
        // Authenticate with Keycloak
        let _o = JSON.parse(JSON.stringify(authOptions));
        _o.form.username = email;
        _o.form.password = password;
       
        let response = await this.asyncRequest(_o); // If unauthorized, an exception is thrown here
        let jwtToken = response.access_token;
        var jwtDecoded = jwtDecode(jwtToken);
        
        // Make sure we have roles for this user
        if(!ignoreMissingRoles && !jwtDecoded.resource_access["kubernetes-cluster"]) {
            throw new Error("This user does not have proper roles configured");
        }
		return jwtDecoded;
    }

    /**
     * adminAuthenticate
     * @param {*} app 
     */
    static async adminAuthenticate() {
        let setting = await DBController.getKeycloakAdminClientSecret();
        if(!setting){
            throw new Error("Keycloak secret not known");
        }
        // Authenticate admin
        let _o = JSON.parse(JSON.stringify(authOptions));
        _o.form['grant_type'] = `client_credentials`;
        _o.form['client_id'] = `master-realm`;
        _o.form['client_secret'] = setting.value;
        _o.form['scope'] = `openid`;
        let response = await this.asyncRequest(_o); 
        return response.access_token;
    }

    /**
     * getUserAttributes
     * @param {*} adminAccessToken 
     * @param {*} email 
     */
    static async getUserAttributes(adminAccessToken, email) {
        // Get user attributes
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.url += `/users?email=${email}`;
        _o.method = "GET";
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        let userDetailList = await this.asyncRequest(_o);

        if(userDetailList.length != 1) {
            throw new Error("User not found");
        } else if(!userDetailList[0].attributes) {
            return {};
        } else {
            return userDetailList[0].attributes;
        }
    }

    /**
     * getUserByEmail
     * @param {*} adminAccessToken 
     * @param {*} email 
     */
    static async getUserByEmail(adminAccessToken, email) {
        // Get user attributes
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.url += `/users?email=${email}`;
        _o.method = "GET";
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        let users = await this.asyncRequest(_o);
        if(users.length == 1) {
            return users[0];
        } else {
            return null;
        }
    }

    /**
     * createUser
     * @param {*} adminAccessToken 
     * @param {*} email 
     * @param {*} password 
     */
    static async createUser(adminAccessToken, email, password) {
        let _o = JSON.parse(JSON.stringify(createUserOptions));
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        _o.json = { 
            "username": email, 
            "email": email, 
            "enabled": true, 
            "emailVerified": true,
            "credentials":[{ "type": "password", "value": password, "temporary": false }]
        };
        await this.asyncRequest(_o);
    }

    /**
     * createClusterGroupBase
     * @param {*} adminAccessToken 
     * @param {*} groupName 
     */
    static async createClusterGroupBase(adminAccessToken, groupName) {
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        _o.url += `/groups`;
        let groups = await this.asyncRequest(_o);
        let rootGroupId = groups.find(o => o.name == "mp").id;

        let _o2 = JSON.parse(JSON.stringify(createOptions));
        _o2.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        _o2.url += `/groups/${rootGroupId}/children`;
        _o2.json = {"name": groupName};

        await this.asyncRequest(_o2);

        groups = await this.asyncRequest(_o);
        return groups.find(o => o.name == "mp").subGroups.find(o => o.name == groupName).id;
    }

    /**
     * createClusterGroup
     * @param {*} adminAccessToken 
     * @param {*} parentGroupId 
     * @param {*} parentGroupName 
     * @param {*} groupName 
     */
    static async createClusterGroup(adminAccessToken, parentGroupId, parentGroupName, groupName) {
        if(parentGroupName){
            let _o = JSON.parse(JSON.stringify(queryOptions));
            _o.headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
            _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
            _o.url += `/groups`;
            let groups = await this.asyncRequest(_o);

            let mcGroup = groups.find(o => o.name == "mp");
            if(mcGroup && mcGroup.subGroups) {
                let wsBaseGroup = mcGroup.subGroups.find(o => o.name == parentGroupName);
                if(wsBaseGroup) {
                    let rootGroupId = wsBaseGroup.id;

                    _o = JSON.parse(JSON.stringify(createOptions));
                    _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
                    _o.url += `/groups/${rootGroupId}/children`;
                    _o.json = {"name": groupName};
            
                    await this.asyncRequest(_o);
                }   
            }
        } else {
            let _o = JSON.parse(JSON.stringify(createOptions));
            _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
            _o.url += `/groups/${parentGroupId}/children`;
            _o.json = {"name": groupName};
    
            await this.asyncRequest(_o);
        }
    }

    /**
     * removeClusterBaseGroupsFromAllUsers
     * @param {*} adminAccessToken 
     * @param {*} parentGroupName 
     */
    static async removeClusterBaseGroupsFromAllUsers(adminAccessToken, parentGroupName) {
        // Get groupId
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        _o.url += `/groups`;
        let groups = await this.asyncRequest(_o);

        let mcGroup = groups.find(o => o.name == "mp");
        if(mcGroup && mcGroup.subGroups) {
            let rootGroup = mcGroup.subGroups.find(o => o.name == parentGroupName);
            if(rootGroup && rootGroup.subGroups) {
                for(let i=0; i<rootGroup.subGroups.length; i++) {
                    let targetGroup = rootGroup.subGroups[i];
                    // Get users of that group
                    _o = JSON.parse(JSON.stringify(queryOptions));
                    _o.url += `/groups/${targetGroup.id}/members?max=9999`;
                    _o.method = "GET";
                    _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
                    let users = await this.asyncRequest(_o);
            
                    for(let y=0; y<users.length; y++) {
                        _o = JSON.parse(JSON.stringify(deleteOptions));
                        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
                        _o.url += `/users/${users[y].id}/groups/${targetGroup.id}`;
                
                        await this.asyncRequest(_o);
                    }
                }
            }
        }
    }

    /**
     * deleteClusterBaseGroup
     * @param {*} adminAccessToken 
     * @param {*} parentGroupName 
     */
    static async deleteClusterBaseGroup(adminAccessToken, parentGroupName) {
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        _o.url += `/groups`;
        let groups = await this.asyncRequest(_o);
        
        let mcGroup = groups.find(o => o.name == "mp");
        if(mcGroup && mcGroup.subGroups) {
            let rootGroup = mcGroup.subGroups.find(o => o.name == parentGroupName);
            if(rootGroup) {
                _o = JSON.parse(JSON.stringify(deleteOptions));
                _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
                _o.url += `/groups/${rootGroup.id}`;

                await this.asyncRequest(_o);
            }
        }
    }

    /**
     * deleteClusterGroup
     * @param {*} adminAccessToken 
     * @param {*} parentGroupName 
     * @param {*} groupName 
     */
    static async deleteClusterGroup(adminAccessToken, parentGroupName, groupName) {
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        _o.url += `/groups`;
        let groups = await this.asyncRequest(_o);

        let mcGroup = groups.find(o => o.name == "mp");
        if(mcGroup && mcGroup.subGroups) {
            let rootGroup = mcGroup.subGroups.find(o => o.name == parentGroupName);
            if(rootGroup && rootGroup.subGroups) {
                let targetGroup = rootGroup.subGroups.find(o => o.name == groupName).id;
                if(targetGroup) {
                    _o = JSON.parse(JSON.stringify(deleteOptions));
                    _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
                    _o.url += `/groups/${targetGroup.id}`;

                    await this.asyncRequest(_o);
                }
            }
        }
    }

    /**
     * addClusterGroupToUser
     * @param {*} adminAccessToken 
     * @param {*} email 
     * @param {*} password 
     */
    static async addClusterGroupToUser(adminAccessToken, userEmail, parentGroupName, groupName) {
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        _o.url += `/groups`;
        let groups = await this.asyncRequest(_o);

        let mcGroup = groups.find(o => o.name == "mp");
        if(mcGroup && mcGroup.subGroups) {
            let rootGroup = mcGroup.subGroups.find(o => o.name == parentGroupName);
            if(rootGroup && rootGroup.subGroups) {
                let targetGroup = rootGroup.subGroups.find(o => o.name == groupName);
                if(targetGroup) {
                    let targetUser = await this.getUserByEmail(adminAccessToken, userEmail);
                    if(targetUser) {
                        _o = JSON.parse(JSON.stringify(putOptions));
                        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
                        _o.url += `/users/${targetUser.id}/groups/${targetGroup.id}`;

                        await this.asyncRequest(_o);
                    }
                }
            }
        }
    }

    /**
     * removeClusterGroupFromUser
     * @param {*} adminAccessToken 
     * @param {*} email 
     * @param {*} password 
     */
    static async removeClusterGroupFromUser(adminAccessToken, userEmail, user, groupName) {
        let _o = JSON.parse(JSON.stringify(queryOptions));
        _o.headers = {'Content-Type': 'application/json', 'Accept': 'application/json'};
        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
        _o.url += `/groups`;
        let groups = await this.asyncRequest(_o);
        let mcGroup = groups.find(o => o.name == "mp");
        if(mcGroup && mcGroup.subGroups) {
            let rootGroup = mcGroup.subGroups.find(o => o.name == parentGroupName);
            if(rootGroup && rootGroup.subGroups) {
                let targetGroup = rootGroup.subGroups.find(o => o.name == groupName);
                if(targetGroup) {
                    let targetUser = user ? user : await this.getUserByEmail(adminAccessToken, userEmail);
                    if(targetUser) {
                        _o = JSON.parse(JSON.stringify(deleteOptions));
                        _o.headers['Authorization'] = `Bearer ${adminAccessToken}`;
                        _o.url += `/users/${targetUser.id}/groups/${targetGroup.id}`;
            
                        await this.asyncRequest(_o);
                    }
                }
            }
        }
    }

    /**
     * getAuthUserFromJwt
     * @param {*} app 
     * @param {*} jwt 
     */
    static async getAuthUserFromJwt(app, jwt) {
        var jwtDecoded = jwtDecode(jwt);
        return await app.service('users').get(parseInt(jwtDecoded.sub), {
            _internalRequest: true
        });
    }

    /**
     * getUserIdFromJwt
     * @param {*} jwt 
     */
    static getUserIdFromJwt(jwt) {
        return parseInt(jwtDecode(jwt).sub);
    }
}
Keycloak.sysAdmins = [];
module.exports = Keycloak;