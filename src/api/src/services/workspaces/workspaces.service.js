// Initializes the `workspaces` service on path `/workspaces`
const { Workspaces } = require('./workspaces.class');
const createModel = require('../../models/workspaces.model');
const hooks = require('./workspaces.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/workspaces', new Workspaces(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('workspaces');

  service.hooks(hooks);
};
