const assert = require('assert');
const app = require('../../src/app');

describe('\'applications\' service', () => {
  it('registered the service', () => {
    const service = app.service('applications');

    assert.ok(service, 'Registered the service');
  });
});
