const { authenticate } = require('@feathersjs/authentication').hooks;
const Permissions = require('../../lib/permission_helper.js');
const { Forbidden } = require('@feathersjs/errors');

const {
  hashPassword, protect
} = require('@feathersjs/authentication-local').hooks;

module.exports = {
	before: {
		all: [],
		find: [ authenticate('jwt') ],
		get: [ authenticate('jwt') ],
		create: [ hashPassword('password'),
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context))){
					throw new Forbidden(new Error('You need to be an account owner to perform this task'));
				}
				context.data.accountId = context.params.user.accountId;
				return context;
			}
		],
		update: [ hashPassword('password'),  authenticate('jwt'),
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context)) && context.id != context.params.user.id){
					throw new Forbidden(new Error('You need to be an account owner or the taget user to perform this task'));
				}
				return context;
			}
		],
		patch: [ hashPassword('password'),  authenticate('jwt'),
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context)) && context.id != context.params.user.id){
					throw new Forbidden(new Error('You need to be an account owner or the taget user to perform this task'));
				}
				return context;
			}
		],
		remove: [ authenticate('jwt'),
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				} else if(!(await Permissions.isAccountOwner(context)) && context.id != context.params.user.id){
					throw new Forbidden(new Error('You need to be an account owner or the taget user to perform this task'));
				}
				return context;
			}
		]
	},

	after: {
		all: [ 
		// Make sure the password field is never sent to the client
		// Always must be the last hook
		protect('password')
		],
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
