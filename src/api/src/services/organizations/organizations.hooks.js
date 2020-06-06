const { authenticate } = require('@feathersjs/authentication').hooks;
const { Forbidden } = require('@feathersjs/errors');
const Permissions = require('../../lib/permission_helper.js');

module.exports = {
	before: {
		all: [ authenticate('jwt') ],
		find: [
			async context => {
				if(!context.params.sequelize) {
					context.params.sequelize = {};
				}
				// Include org users
				context.params.sequelize.raw = false;
				context.params.sequelize.include = {
					model: context.app.services['org-users'].Model,
					as: 'org_users'
				};
				return context;
			},
		],
		get: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} 
				await Permissions.userBelongsToAccount_org(context, context.id);
				return context;
			}
		],
		create: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context, context.data.accountId))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				return context;
			}
		],
		update: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context, context.data.accountId))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				await Permissions.userBelongsToAccount_org(context, context.id);
				return context;
			}
		],
		patch: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isResourceAccountOwner(context, context.id))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				await Permissions.userBelongsToAccount_org(context, context.id);
				return context;
			}
		],
		remove: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isResourceAccountOwner(context, context.id))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				} 
				await Permissions.userBelongsToAccount_org(context, context.id);
				return context;
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
					context.result.data = context.result.data.filter((org) => {
						return orgUsers.find(o => o.organizationId == org.id) ? true : false;
					});
					context.result.total = context.result.data.length;
				} else {
					context.result = context.result.filter((org) => {
						return orgUsers.find(o => o.organizationId == org.id) ? true : false;
						
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
