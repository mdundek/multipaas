// Initializes the `certificates` service on path `/certificates`
const { Certificates } = require('./certificates.class');
const createModel = require('../../models/certificates.model');
const hooks = require('./certificates.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/certificates', new Certificates(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('certificates');

  service.hooks(hooks);
};
