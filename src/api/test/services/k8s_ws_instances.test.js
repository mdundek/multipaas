const assert = require('assert');
const app = require('../../src/app');

describe('\'k8s_nodes\' service', () => {
  it('registered the service', () => {
    const service = app.service('k8s_nodes');

    assert.ok(service, 'Registered the service');
  });
});
