// Initializes the `services` service on path `/services`
const { Services } = require('./services.class');
const createModel = require('../../models/services.model');
const hooks = require('./services.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/services', new Services(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('services');

  service.hooks(hooks);
};
