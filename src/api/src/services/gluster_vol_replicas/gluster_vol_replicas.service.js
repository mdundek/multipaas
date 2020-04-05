// Initializes the `gluster_vol_replicas` service on path `/gluster-vol-replicas`
const { GlusterVolReplicas } = require('./gluster_vol_replicas.class');
const createModel = require('../../models/gluster_vol_replicas.model');
const hooks = require('./gluster_vol_replicas.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/gluster-vol-replicas', new GlusterVolReplicas(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('gluster-vol-replicas');

  service.hooks(hooks);
};
