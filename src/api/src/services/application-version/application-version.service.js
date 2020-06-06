// Initializes the `applicationVersion` service on path `/application-version`
const { ApplicationVersion } = require('./application-version.class');
const createModel = require('../../models/application-version.model');
const hooks = require('./application-version.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/application-version', new ApplicationVersion(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('application-version');

  service.hooks(hooks);
};
