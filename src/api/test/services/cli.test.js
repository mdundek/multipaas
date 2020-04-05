const assert = require('assert');
const app = require('../../src/app');

describe('\'cli\' service', () => {
  it('registered the service', () => {
    const service = app.service('cli');

    assert.ok(service, 'Registered the service');
  });
});
