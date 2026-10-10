const test = require('node:test');
const assert = require('node:assert/strict');
const { InvoicesService } = require('../dist/modules/invoices/invoices.service');

test('invoice creation does not encode an unapproved revenue split', async () => {
  let saved;
  const repo = {
    create: (value) => ({ ...value }),
    save: async (value) => { saved = value; return value; },
  };
  const service = new InvoicesService(repo);
  const result = await service.create(
    { id: 'parcel-1', recipient_id: 'recipient-1', current_hub_id: 'hub-1' },
    { basePostCost: 18000, elapsedHours: 10, feePercentage: 0.2, calculatedFee: 3600 },
  );
  assert.equal(result.total_amount, 3600);
  assert.equal(result.hub_owner_share, 0);
  assert.equal(result.platform_fee, 0);
  assert.equal(saved.hub_owner_share, 0);
  assert.equal(saved.platform_fee, 0);
});

test('invoice creation refuses unresolved recipient or hub identity', async () => {
  const service = new InvoicesService({ create: (value) => value, save: async (value) => value });
  await assert.rejects(
    service.create({ id: 'parcel-2', recipient_id: null, current_hub_id: 'hub-1' }, { calculatedFee: 10 }),
    (error) => error && error.getStatus && error.getStatus() === 400,
  );
});
