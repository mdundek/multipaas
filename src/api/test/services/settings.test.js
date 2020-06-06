const assert = require('assert');
const app = require('../../src/app');

describe('\'settings\' service', () => {
  it('registered the service', () => {
    const service = app.service('settings');

    assert.ok(service, 'Registered the service');
  });
});
