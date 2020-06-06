const { Forbidden, NotFound } = require('@feathersjs/errors');
const { NotAuthenticated, GeneralError } = require('@feathersjs/errors');
const request = require("request");
const jwtDecode = require('jwt-decode');
const DBController = require("../controllers/db/index");

class PermissionHelper {

    /**
     * asyncRequest
     * @param {*} opt 
     */
    static asyncRequest(opt) {
        return new Promise((resolve, reject) => {
            request(opt, (error, response, body) => {
                if(error) {
                    reject(new GeneralError(error));
                } else if (response.statusCode == 401) {
                    reject(new NotAuthenticated(new Error('Unauthorized')));
                } else if (response.statusCode < 200 || response.statusCode > 299) {
                    reject(new GeneralError(new Error("Unexpected error")));
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
     * isSysAdmin
     * @param {*} context 
     */
    static async isSysAdmin(context) {
        if(!context.params.authentication){
            return false;
        }
        let userId = this.getUserIdFromJwt(context.params.authentication.accessToken);
        if(this.sysAdmins.length == 0) {
            this.sysAdmins = await context.app.service('users').find({
                paginate: false,
                query: {
                    email: process.env.API_SYSADMIN_USER
                },
                _internalRequest: true
            });
        }

        return this.sysAdmins.find(o => o.id == userId) ? true : false;
    }

    /**
     * isResourceAccountOwner
     * @param {*} context 
     * @param {*} orgId 
     * @param {*} wsId 
     */
    static async isResourceAccountOwner(context, orgId, wsId) {
        let acc = null;
        if(orgId != null && orgId != undefined) {
            acc = await DBController.getAccountForOrg(orgId);
        } else {
            acc = await DBController.getAccountForWs(wsId);
        }
        let userId = this.getUserIdFromJwt(context.params.authentication.accessToken);
        let accUsers = await context.app.service('acc-users').find({
            query: {
                userId: userId,
                isAccountOwner: true
            },
            paginate: false,
            _internalRequest: true
        });
        return accUsers.find(o => o.accountId == acc.id);
    }

    /**
     * isAccountOwner
     * @param {*} context 
     */
    static async isAccountOwner(context, accountId) {
        let userId = this.getUserIdFromJwt(context.params.authentication.accessToken);
        let accUsers = await context.app.service('acc-users').find({
            paginate: false,
            query: {
                userId: userId,
                isAccountOwner: true
            },
            _internalRequest: true
        });
        return accUsers.find(o => o.accountId == accountId);
    }

    /**
     * userBelongsToAccount_org
     * @param {*} context 
     * @param {*} orgId 
     */
    static async userBelongsToAccount_org(context, orgId) {
        if(!context.params.authentication){
            throw new Forbidden(new Error('You are not logged in'));
        }

        let userId = this.getUserIdFromJwt(context.params.authentication.accessToken);
        // Make sure user account matches org account
        try{
            let accUsers = await context.app.service('acc-users').find({
                paginate: false,
                query: {
                    userId: userId
                },
                _internalRequest: true
            });

            context.params._internalRequest = true;
            let org = await context.app.service('organizations').get(orgId, context.params);
    
            if(!accUsers.find(o => o.accountId == org.accountId)){
                throw new Forbidden(new Error('This organization does not belong to your account'));
            }
        } catch(err) {
            if(err.code == 404){
                throw new NotFound(new Error ("Organization not found"));
            }
            throw err;
        }
    }

    /**
     * isAccountOwnerAllowed_ws
     * @param {*} context 
     * @param {*} wsId 
     */
    static async isAccountOwnerAllowed_ws(context, wsId) {
        let adminUserOrgs = await this.getAccOwnerOrgsInWorkspaceContext(context, wsId);
        let orgIdArray = adminUserOrgs.data.map(o => o.id);
        context.params._internalRequest = true;
        let targetWs = await context.app.service('workspaces').get(wsId, context.params);
        if(orgIdArray.indexOf(targetWs.organizationId) != -1){
            return true;
        } else {
            return false;
        }
    }

    /**
     * isOrgUserAllowed_ws
     * @param {*} context 
     * @param {*} wsId 
     */
    static async isOrgUserAllowed_ws(context, wsId) {
        let userId = this.getUserIdFromJwt(context.params.authentication.accessToken);
        let orgUsers = await context.app.service('org-users').find({
            query: {
                userId: userId
            }
        });

        context.params._internalRequest = true;
        let targetWs = await context.app.service('workspaces').get(wsId, context.params);

        for(let i=0; i<orgUsers.data.length; i++){
            if(orgUsers.data[i].organizationId == targetWs.organizationId) {
                return true;
            }
        }
        return false;
    }

    /**
     * isOrgUserAdmin_ws
     * @param {*} context 
     * @param {*} orgId 
     */
    static async isOrgUserAdmin_ws(context, orgId) {
        let userId = this.getUserIdFromJwt(context.params.authentication.accessToken);
        let orgUsers = await context.app.service('org-users').find({
            paginate: false,
            query: {
                userId: userId,
                organizationId: orgId
            }
        });
        if(orgUsers.length == 0) {
            return false;
        } else if(orgUsers[0].permissions.split(";").indexOf("ORG_ADMIN") != -1) {
            return true;
        }
        return false;
    }

    /**
     * getAccOwnerOrgsInWorkspaceContext
     * @param {*} context 
     * @param {*} wsId 
     */
    static async getAccOwnerOrgsInWorkspaceContext(context, wsId) {
        if(!context.params.authentication){
            return [];
        }
        // let userId = this.getUserIdFromJwt(context.params.authentication.accessToken);
        try{
            let acc = await DBController.getAccountForWs(wsId);
            return await context.app.service('organizations').find({
				query: {
					accountId: acc.id
                },
                _internalRequest: true
            });
        } catch(err) {
            if(err.code == 404){
                throw new NotFound(new Error ("Organization not found"));
            }
            throw err;
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
PermissionHelper.sysAdmins = [];
module.exports = PermissionHelper;