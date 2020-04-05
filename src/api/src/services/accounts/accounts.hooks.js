const { authenticate } = require('@feathersjs/authentication').hooks;
const Permissions = require('../../lib/permission_helper.js');
const { Forbidden } = require('@feathersjs/errors');

module.exports = {
	before: {
		all: [authenticate('jwt')],
		find: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else {
					throw new Forbidden(new Error('You need to be a a sys admin to perform this task'));
				}
			}
		],
		get: [
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				} else if(context.id != context.params.user.accountId){
					throw new Forbidden(new Error('You are not entitled to view accounts that are not yours'));
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
				} else if(!(await Permissions.isAccountOwner(context))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				} else if(context.id != context.params.user.accountId){
					throw new Forbidden(new Error('You are not entitled to view accounts that are not yours'));
				}
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
				} else if(context.id != context.params.user.accountId){
					throw new Forbidden(new Error('You are not entitled to view accounts that are not yours'));
				}
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
				} else if(context.id != context.params.user.accountId){
					throw new Forbidden(new Error('You are not entitled to view accounts that are not yours'));
				}
				return context;
			}
		]
	},

	after: {
		all: [],
		find: [],
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
