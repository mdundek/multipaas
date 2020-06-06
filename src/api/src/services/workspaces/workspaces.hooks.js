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
			} else if((await Permissions.isResourceAccountOwner(context, null, context.id))){
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
			} else if((await Permissions.isResourceAccountOwner(context, context.data.organizationId, null))){
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
			} else if((await Permissions.isResourceAccountOwner(context, null, context.id))){
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
			} else if((await Permissions.isResourceAccountOwner(context, null, context.id))){
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
			} else if((await Permissions.isResourceAccountOwner(context, null, context.id))){
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
			if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
				delete context.params._internalRequest;
				return context;
			}

			let userId = Permissions.getUserIdFromJwt(context.params.authentication.accessToken);
			let orgUsers = await context.app.service('org-users').find({
				paginate: false,
				query: {
					userId: userId
				}
			});
	
			// Itterate over all returned organizations
			if(context.result.data){
				context.result.data = context.result.data.filter((ws) => {
					return orgUsers.find(o => o.organizationId == ws.organizationId) ? true : false;
					
				});
				context.result.total = context.result.data.length;
			} else {
				context.result = context.result.filter((ws) => {
					return orgUsers.find(o => o.organizationId == ws.organizationId) ? true : false;
					
				});
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
