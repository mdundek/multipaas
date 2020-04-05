// Initializes the `gluster_hosts` service on path `/gluster-hosts`
const { GlusterHosts } = require('./gluster_hosts.class');
const createModel = require('../../models/gluster_hosts.model');
const hooks = require('./gluster_hosts.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/gluster-hosts', new GlusterHosts(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('gluster-hosts');

  service.hooks(hooks);
};
