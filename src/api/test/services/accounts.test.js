const assert = require('assert');
const app = require('../../src/app');

describe('\'accounts\' service', () => {
  it('registered the service', () => {
    const service = app.service('accounts');

    assert.ok(service, 'Registered the service');
  });
});
