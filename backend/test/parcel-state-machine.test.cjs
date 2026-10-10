const test = require('node:test');
const assert = require('node:assert/strict');
const { ParcelStatus, canTransitionParcel, validateParcelTransition } = require('../dist/modules/parcels/parcel-state-machine');

test('parcel status vocabulary is explicit and initializes at delivery attempt', () => {
  assert.equal(ParcelStatus.DELIVERY_ATTEMPT, 'DELIVERY_ATTEMPT');
  assert.equal(Object.keys(ParcelStatus).length, 14);
});

test('allowed parcel lifecycle transitions are accepted', () => {
  assert.equal(canTransitionParcel(ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.CUSTOMER_REQUEST), true);
  assert.equal(canTransitionParcel(ParcelStatus.HUB_SELECTED, ParcelStatus.HANDOVER_IN_PROGRESS), true);
  assert.equal(canTransitionParcel(ParcelStatus.COLLECTED, ParcelStatus.SETTLEMENT), true);
  assert.doesNotThrow(() => validateParcelTransition(ParcelStatus.DELIVERED, ParcelStatus.SETTLEMENT));
});

test('invalid parcel transitions and transitions out of settlement are rejected', () => {
  assert.equal(canTransitionParcel(ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.READY_FOR_CUSTOMER), false);
  assert.equal(canTransitionParcel(ParcelStatus.SETTLEMENT, ParcelStatus.HUB_SELECTED), false);
  assert.throws(() => validateParcelTransition(ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.READY_FOR_CUSTOMER), /Invalid parcel status transition/);
});
