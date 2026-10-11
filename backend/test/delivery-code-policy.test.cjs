const test = require('node:test');
const assert = require('node:assert/strict');
const { DELIVERY_CODE_TTL_MS } = require('../dist/modules/parcels/parcels.service');

test('delivery code validity matches the approved one-hour business policy', () => {
  assert.equal(DELIVERY_CODE_TTL_MS, 60 * 60 * 1000);
});
