const assert = require('assert');
const app = require('../../src/app');

describe('\'org-users\' service', () => {
  it('registered the service', () => {
    const service = app.service('org-users');

    assert.ok(service, 'Registered the service');
  });
});
