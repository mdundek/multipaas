// Initializes the `accounts` service on path `/accounts`
const { Accounts } = require('./accounts.class');
const createModel = require('../../models/accounts.model');
const hooks = require('./accounts.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/accounts', new Accounts(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('accounts');

  service.hooks(hooks);
};
