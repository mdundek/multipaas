// Initializes the `applications` service on path `/applications`
const { Applications } = require('./applications.class');
const createModel = require('../../models/applications.model');
const hooks = require('./applications.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/applications', new Applications(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('applications');

  service.hooks(hooks);
};
