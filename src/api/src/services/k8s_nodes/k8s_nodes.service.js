// Initializes the `k8s_nodes` service on path `/k8s_nodes`
const { K8sNodes } = require('./k8s_nodes.class');
const createModel = require('../../models/k8s_nodes.model');
const hooks = require('./k8s_nodes.hooks');

module.exports = function (app) {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate')
  };

  // Initialize our service with any options it requires
  app.use('/k8s_nodes', new K8sNodes(options, app));

  // Get our initialized service so that we can register hooks
  const service = app.service('k8s_nodes');

  service.hooks(hooks);
};
