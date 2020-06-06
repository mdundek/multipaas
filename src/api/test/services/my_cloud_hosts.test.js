const assert = require('assert');
const app = require('../../src/app');

describe('\'k8s_hosts\' service', () => {
  it('registered the service', () => {
    const service = app.service('k8s_hosts');

    assert.ok(service, 'Registered the service');
  });
});
