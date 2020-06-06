const assert = require('assert');
const app = require('../../src/app');

describe('\'domains\' service', () => {
  it('registered the service', () => {
    const service = app.service('domains');

    assert.ok(service, 'Registered the service');
  });
});
