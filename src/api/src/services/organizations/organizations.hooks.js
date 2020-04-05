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
				} else if(!(await Permissions.isAccountOwner(context))){
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
				} else if(!(await Permissions.isAccountOwner(context))){
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
				} else if(!(await Permissions.isAccountOwner(context))){
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
				} else if(!(await Permissions.isAccountOwner(context))){
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
				// Is user is sysadmin, return it all
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				}

				// Is current user a account owner?
				let isAccountOwner = false;
				if(await Permissions.isAccountOwner(context)){
					isAccountOwner = true;
				}

				// Itterate over all returned organizations
				context.result.data = context.result.data.filter((org, z) => {
					// User is account owner for this org, permission granted
					if(isAccountOwner && org.accountId == context.params.user.accountId){
						return true;
					} 
					// User is regular user and does not belong to the org account
					else if(!isAccountOwner && org.accountId != context.params.user.accountId){
						return false;
					}
					// Filter out org users if current user does not 
					// have sufficient permissions to view the data
					let authOrgUser = org.org_users.find(ou => ou.userId == context.params.user.id);
					if(authOrgUser){
						for(let y=0; y<org.org_users.length; y++){
							if( authOrgUser.permissions.split(';').indexOf("ORG_ADMIN") == -1 && 
								org.org_users[y].userId != context.params.user.id
							) {
								org.org_users.splice(z, 1);
								y--;
							}
						}
						// context.result.data[z] = org;
						return true;
					}
					return false;
				});
				context.result.total = context.result.data.length;
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
