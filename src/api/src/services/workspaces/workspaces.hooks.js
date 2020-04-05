const { authenticate } = require('@feathersjs/authentication').hooks;
const { Forbidden } = require('@feathersjs/errors');
const Permissions = require('../../lib/permission_helper.js');

module.exports = {
  before: {
    all: [ authenticate('jwt') ],
    find: [],
    get: [
		async context => {
			// Is user is sysadmin, return it all
			if((await Permissions.isSysAdmin(context)) || context.params._internalRequest){
				delete context.params._internalRequest;
				return context;
			} else if(await Permissions.isAccountOwner(context)){
				if(await Permissions.isAccountOwnerAllowed_ws(context, context.id)){
					return context;
				} else {
					throw new Forbidden(new Error('You are not allowed to perform this task'));
				}
			} else {
				if(await Permissions.isOrgUserAllowed_ws(context, context.id)){
					return context;
				} else {
					throw new Forbidden(new Error('You are not allowed to perform this task'));
				}
			}
		}
	],
    create: [
		async context => {
			// Is user is sysadmin, return it all
			if((await Permissions.isSysAdmin(context)) || context.params._internalRequest){
				delete context.params._internalRequest;
				return context;
			} else if(await Permissions.isAccountOwner(context)){
				await Permissions.userBelongsToAccount_org(context, context.data.organizationId);
			} else {
				if(await Permissions.isOrgUserAdmin_ws(context, context.data.organizationId)){
					return context;
				} else {
					throw new Forbidden(new Error('You are not allowed to perform this task'));
				}
			}
		}
	],
    update: [
		async context => {
			// Is user is sysadmin, return it all
			if((await Permissions.isSysAdmin(context)) || context.params._internalRequest){
				delete context.params._internalRequest;
				return context;
			} else if(await Permissions.isAccountOwner(context)){
				if(await Permissions.isAccountOwnerAllowed_ws(context, context.id)){
					return context;
				} else {
					throw new Forbidden(new Error('You are not allowed to perform this task'));
				}
			} else {
				throw new Forbidden(new Error('You are not allowed to perform this task'));
			}
		}
	],
    patch: [
		async context => {
			// Is user is sysadmin, return it all
			if((await Permissions.isSysAdmin(context)) || context.params._internalRequest){
				delete context.params._internalRequest;
				return context;
			} else if(await Permissions.isAccountOwner(context)){
				if(await Permissions.isAccountOwnerAllowed_ws(context, context.id)){
					return context;
				} else {
					throw new Forbidden(new Error('You are not allowed to perform this task'));
				}
			} else {
				throw new Forbidden(new Error('You are not allowed to perform this task'));
			}
		}
	],
    remove: [
		async context => {
			// If user is sysadmin, return it all
			if((await Permissions.isSysAdmin(context)) || context.params._internalRequest){
				delete context.params._internalRequest;
				return context;
			} else if(await Permissions.isAccountOwner(context)){
				if(await Permissions.isAccountOwnerAllowed_ws(context, context.id)){
					return context;
				} else {
					throw new Forbidden(new Error('You are not allowed to perform this task'));
				}
			} else {
				throw new Forbidden(new Error('You are not allowed to perform this task'));
			}
		}
	]
  },
  after: {
    all: [],
    find: [
		async context => {
			// Is user is sysadmin, return it all
			if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
				delete context.params._internalRequest;
				return context;
			} else if(await Permissions.isAccountOwner(context)){
				let adminUserOrgs = await Permissions.getAccountOwnerOrganizations(context);
				let orgIdArray = adminUserOrgs.data.map(o => o.id);
		
				// Itterate over all returned workspaces
				context.result.data = context.result.data.filter((ws, z) => {
					// User is account owner for this ws, permission granted
					if(orgIdArray.indexOf(ws.organizationId) != -1){
						return true;
					}
					return false;
				});
				
				context.result.total = context.result.data.length;
			} else {
				let orgUsers = await context.app.service('org-users').find({
					query: {
						userId: context.params.user.id
					},
					user: context.params.user
				});

				let agregatedData = [];
				for(let i=0; i<orgUsers.data.length; i++){
					agregatedData = [...agregatedData, ...(context.result.data.filter((ws) => {
						return ws.organizationId == orgUsers.data[i].organizationId;
					}))]; 
				}
				context.result.data = agregatedData;
				context.result.total = context.result.data.length;
			}
			return context;
		}
	],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  }
};
