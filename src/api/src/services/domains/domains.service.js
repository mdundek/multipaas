// Initializes the `domains` service on path `/domains`
const { Domains } = require('./domains.class');
const createModel = require('../../models/domains.model');
const hooks = require('./domains.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/domains', new Domains(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('domains');

  service.hooks(hooks);
};
