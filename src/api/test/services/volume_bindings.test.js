const assert = require('assert');
const app = require('../../src/app');

describe('\'volume_bindings\' service', () => {
  it('registered the service', () => {
    const service = app.service('volume-bindings');

    assert.ok(service, 'Registered the service');
  });
});
