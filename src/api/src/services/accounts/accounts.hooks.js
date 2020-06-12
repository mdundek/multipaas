const { authenticate } = require('@feathersjs/authentication').hooks;
const Permissions = require('../../lib/permission_helper.js');
const { Forbidden } = require('@feathersjs/errors');

module.exports = {
	before: {
		all: [],
		find: [
			async context => {
				const sequelize = context.app.get('sequelizeClient');
						if(!context.params.sequelize) {
							context.params.sequelize = {};
				}				
				context.params.sequelize.raw = false;
				context.params.sequelize.include = { model: sequelize.models.acc_users};
				return context;
			},
		],
		get: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context, context.id))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				return context;
			}
		],
		create: [],
		update: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context, context.id))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				return context;
			}
		],
		patch: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context, context.id))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				return context;
			}
		],
		remove: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context, context.id))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				return context;
			}
		]
	},
	after: {
		all: [],
		find: [async context => {
			// Is user is sysadmin, return it all
			if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
				delete context.params._internalRequest;
				return context;
			}

			let userId = Permissions.getUserIdFromJwt(context.params.authentication.accessToken);
			let accUsers = await context.app.service('acc-users').find({
				paginate: false,
				query: {
					userId: userId
				},
				_internalRequest: true
			});
		
			// Itterate over all returned organizations
			if(context.result.data){
				context.result.data = context.result.data.filter((acc, z) => {
					return accUsers.find(o => o.accountId == acc.id);
				});
				context.result.total = context.result.data.length;
			} else {
				context.result = context.result.filter((acc, z) => {
					return accUsers.find(o => o.accountId == acc.id);
				});
			}
			return context;
		}],
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
