// Initializes the `k8s_hosts` service on path `/k8s_hosts`
const { K8sHosts } = require('./k8s_hosts.class');
const createModel = require('../../models/k8s_hosts.model');
const hooks = require('./k8s_hosts.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/k8s_hosts', new K8sHosts(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('k8s_hosts');

  service.hooks(hooks);
};
