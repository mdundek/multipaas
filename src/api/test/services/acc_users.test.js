const assert = require('assert');
const app = require('../../src/app');

describe('\'acc_users\' service', () => {
  it('registered the service', () => {
    const service = app.service('acc-users');

    assert.ok(service, 'Registered the service');
  });
});
