// Initializes the `routes` service on path `/routes`
const { Routes } = require('./routes.class');
const createModel = require('../../models/routes.model');
const hooks = require('./routes.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/routes', new Routes(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('routes');

  service.hooks(hooks);
};
