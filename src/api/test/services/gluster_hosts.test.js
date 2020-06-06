const assert = require('assert');
const app = require('../../src/app');

describe('\'gluster_hosts\' service', () => {
  it('registered the service', () => {
    const service = app.service('gluster-hosts');

    assert.ok(service, 'Registered the service');
  });
});
