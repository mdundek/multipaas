const { Forbidden, NotFound } = require('@feathersjs/errors');

class PermissionHelper {

    /**
     * initRoles
     * @param {*} context 
     */
    static async initRoles(context) {
        if(!this.roles){
            this.roles = (await context.app.service('roles').find({ query: {
                $or: [{ name: "ACCOUNT_OWNER" },{ name: "SYSADMIN" }]
            }})).data;
        }
    }

    /**
     * isSysAdmin
     * @param {*} context 
     */
    static async isSysAdmin(context) {
        await this.initRoles(context);
        if(!context.params.user){
            return false;
        }
        if(this.roles.find(r => r.id == context.params.user.roleId && r.name == "SYSADMIN")){
            return true;
        } 
        return false;
    }

    /**
     * isAccountOwner
     * @param {*} context 
     */
    static async isAccountOwner(context) {
        await this.initRoles(context);
        if(!context.params.user){
            return false;
        }
        if(this.roles.find(r => r.id == context.params.user.roleId && r.name == "ACCOUNT_OWNER")){
            return true;
        }
        return false;
    }

    /**
     * userBelongsToAccount_org
     * @param {*} context 
     * @param {*} orgId 
     */
    static async userBelongsToAccount_org(context, orgId) {
        if(!context.params.user){
            throw new Forbidden(new Error('You are not logged in'));
        }
        // Make sure user account matches org account
        try{
            context.params._internalRequest = true;
            let org = await context.app.service('organizations').get(orgId, context.params);
            if(org.accountId != context.params.user.accountId){
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
        let adminUserOrgs = await this.getAccountOwnerOrganizations(context);
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
        let orgUsers = await context.app.service('org-users').find({
            query: {
                userId: context.params.user.id
            },
            user: context.params.user
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
        let orgUsers = await context.app.service('org-users').find({
            query: {
                userId: context.params.user.id
            },
            user: context.params.user
        });

        for(let i=0; i<orgUsers.data.length; i++){
            if(orgUsers.data[i].organizationId == orgId && orgUsers.data[i].permissions.split(";").indexOf("ORG_ADMIN") != -1) {
                return true;
            }
        }
        return false;
    }

    /**
     * getAccountOwnerOrganizations
     * @param {*} context 
     */
    static async getAccountOwnerOrganizations(context) {
        if(!context.params.user){
            return [];
        }
        try{
            context.params._internalRequest = true;
            return await context.app.service('organizations').find({
				query: {
					accountId: context.params.user.accountId
                },
                user: context.params.user
            });
        } catch(err) {
            if(err.code == 404){
                throw new NotFound(new Error ("Organization not found"));
            }
            throw err;
        }
    }
}
PermissionHelper.roles = null;
module.exports = PermissionHelper;