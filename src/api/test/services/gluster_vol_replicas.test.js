const assert = require('assert');
const app = require('../../src/app');

describe('\'gluster_vol_replicas\' service', () => {
  it('registered the service', () => {
    const service = app.service('gluster-vol-replicas');

    assert.ok(service, 'Registered the service');
  });
});
