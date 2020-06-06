const { authenticate } = require('@feathersjs/authentication').hooks;
const Permissions = require('../../lib/permission_helper.js');
const { Forbidden } = require('@feathersjs/errors');

const {
  hashPassword, protect
} = require('@feathersjs/authentication-local').hooks;

module.exports = {
	before: {
		all: [],
		find: [ 
			authenticate('jwt'), 
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
		get: [ authenticate('jwt') ],
		create: [ hashPassword('password')],
		update: [ hashPassword('password'),  authenticate('jwt'),
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				}
				return context;
			}
		],
		patch: [ hashPassword('password'),  authenticate('jwt'),
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
				}
				return context;
			}
		],
		remove: [ authenticate('jwt'),
			async context => {
				if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
					delete context.params._internalRequest;
					return context;
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
