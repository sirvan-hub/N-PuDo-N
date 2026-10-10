const test = require('node:test');
const assert = require('node:assert/strict');
const { ParcelsService } = require('../dist/modules/parcels/parcels.service');
const { ParcelStatus } = require('../dist/modules/parcels/parcel-state-machine');

const dto = {
  tracking_code: 'TRACK-CI-001',
  recipient_phone: '+989120000001',
  recipient_name: 'CI Recipient',
  recipient_address: 'Test address',
  base_post_cost: 18000,
  proposed_hub_id: 'hub-1',
};

function makeService({ recipient = { id: 'recipient-1' }, hub = { id: 'hub-1', is_active: true, is_temporarily_closed: false } } = {}) {
  const saved = [];
  const service = new ParcelsService(
    { create: (value) => ({ ...value }), save: async (value) => { saved.push(value); return value; }, findOne: async () => null },
    { findOne: async () => hub },
    { findOne: async () => recipient },
  );
  return { service, saved };
}

test('parcel creation resolves recipient and validates the proposed hub without claiming custody', async () => {
  const { service, saved } = makeService();
  const parcel = await service.create(dto, 'courier-1');

  assert.equal(parcel.recipient_id, 'recipient-1');
  assert.equal(parcel.proposed_hub_id, 'hub-1');
  assert.equal(parcel.current_hub_id, null);
  assert.equal(parcel.courier_id, 'courier-1');
  assert.equal(parcel.status, ParcelStatus.DELIVERY_ATTEMPT);
  assert.equal(saved.length, 1);
});

test('parcel creation rejects an unregistered recipient', async () => {
  const { service } = makeService({ recipient: null });
  await assert.rejects(
    service.create(dto, 'courier-1'),
    (error) => error && error.getStatus && error.getStatus() === 400,
  );
});

test('parcel creation rejects a missing, inactive, or temporarily closed proposed hub', async (t) => {
  for (const hub of [null, { id: 'hub-1', is_active: false, is_temporarily_closed: false }, { id: 'hub-1', is_active: true, is_temporarily_closed: true }]) {
    await t.test(JSON.stringify(hub), async () => {
      const { service } = makeService({ hub });
      await assert.rejects(
        service.create(dto, 'courier-1'),
        (error) => error && error.getStatus && error.getStatus() === 400,
      );
    });
  }
});
