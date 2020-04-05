// Initializes the `volume_bindings` service on path `/volume-bindings`
const { VolumeBindings } = require('./volume_bindings.class');
const createModel = require('../../models/volume_bindings.model');
const hooks = require('./volume_bindings.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/volume-bindings', new VolumeBindings(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('volume-bindings');

  service.hooks(hooks);
};
