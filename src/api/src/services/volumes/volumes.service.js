// Initializes the `volumes` service on path `/volumes`
const { GlusterVolumes } = require('./volumes.class');
const createModel = require('../../models/volumes.model');
const hooks = require('./volumes.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/volumes', new GlusterVolumes(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('volumes');

  service.hooks(hooks);
};
