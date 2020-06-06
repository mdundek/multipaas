const { authenticate } = require('@feathersjs/authentication').hooks;
const Permissions = require('../../lib/permission_helper.js');

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
        context.params.sequelize.include = [{ model: sequelize.models.users}, { model: sequelize.models.organizations}];
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
    find: [
      // async context => {
      //   if(await Permissions.isSysAdmin(context) || context.params._internalRequest){
      //     delete context.params._internalRequest;
      //     return context;
      //   }
      //   console.log(context);
      //   let userId = Permissions.getUserIdFromJwt(context.params.authentication.accessToken);
      //   let orgUsers = await context.app.service('org-users').find({
      //     paginate: false,
      //     query: {
      //       userId: userId
      //     }
      //   });
        
      //   // Itterate over all returned organizations
      //   if(context.result.data){
      //     context.result.data = context.result.data.filter((orgUser) => {
      //       return orgUsers.find(o => o.organizationId == orgUser.organizationId) ? true : false;
      //     });
      //     context.result.total = context.result.data.length;
      //   } else {
      //     context.result = context.result.filter((orgUser) => {
      //       return orgUsers.find(o => o.organizationId == orgUser.organizationId) ? true : false;
      //     });
      //   }
      //   return context;
      // }
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
