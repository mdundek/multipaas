const { authenticate } = require('@feathersjs/authentication').hooks;

module.exports = {
  before: {
    all: [ authenticate('jwt') ],
    find: [
      async context => {
        const sequelize = context.app.get('sequelizeClient');
				if(!context.params.sequelize) {
					context.params.sequelize = {};
        }				
        context.params.sequelize.raw = false;
        context.params.sequelize.include = { model: sequelize.models.accounts};
				return context;
			},
    ],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
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
