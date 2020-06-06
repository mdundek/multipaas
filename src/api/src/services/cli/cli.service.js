// Initializes the `cli` service on path `/cli`
const { Cli } = require('./cli.class');
const hooks = require('./cli.hooks');

module.exports = function (app) {
  const options = {
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/cli', new Cli(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('cli');

  service.hooks(hooks);
};
