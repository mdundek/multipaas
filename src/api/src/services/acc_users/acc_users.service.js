// Initializes the `acc_users` service on path `/acc-users`
const { AccUsers } = require('./acc_users.class');
const createModel = require('../../models/acc_users.model');
const hooks = require('./acc_users.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/acc-users', new AccUsers(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('acc-users');

  service.hooks(hooks);
};
