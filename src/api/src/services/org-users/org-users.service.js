// Initializes the `org-users` service on path `/org-users`
const { OrgUsers } = require('./org-users.class');
const createModel = require('../../models/org-users.model');
const hooks = require('./org-users.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/org-users', new OrgUsers(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('org-users');

  service.hooks(hooks);
};
