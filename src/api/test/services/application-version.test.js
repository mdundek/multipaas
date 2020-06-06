const assert = require('assert');
const app = require('../../src/app');

describe('\'applicationVersion\' service', () => {
  it('registered the service', () => {
    const service = app.service('application-version');

    assert.ok(service, 'Registered the service');
  });
});
