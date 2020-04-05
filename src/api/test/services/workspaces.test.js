const assert = require('assert');
const app = require('../../src/app');

describe('\'workspaces\' service', () => {
  it('registered the service', () => {
    const service = app.service('workspaces');

    assert.ok(service, 'Registered the service');
  });
});
