const test = require('node:test');
const assert = require('node:assert/strict');
const { InvoicesService } = require('../dist/modules/invoices/invoices.service');

test('invoice snapshots the current 30% hub share without assuming a platform split', async () => {
  let saved;
  const repo = {
    create: (value) => ({ ...value }),
    save: async (value) => { saved = value; return value; },
  };
  const service = new InvoicesService(repo);
  const result = await service.create(
    { id: 'parcel-1', recipient_id: 'recipient-1', current_hub_id: 'hub-1' },
    { basePostCost: 18000, elapsedHours: 10, feePercentage: 0.2, calculatedFee: 3601 },
  );
  assert.equal(result.total_amount, 3601);
  assert.equal(result.hub_owner_share, 1080);
  assert.equal(result.platform_fee, 0);
  assert.equal(result.hub_share_percent, 30);
  assert.deepEqual(result.hub_share_snapshot, {
    snapshotVersion: 1,
    rule: 'fixed-percentage-of-invoice-total',
    percentage: 30,
    basisAmount: 3601,
    hubOwnerShare: 1080,
    currencyUnit: 'TOMAN',
    capturedAt: result.hub_share_snapshot.capturedAt,
  });
  assert.equal(saved.hub_owner_share, 1080);
  assert.equal(saved.platform_fee, 0);
});

test('invoice uses the current configurable rate and keeps a per-invoice snapshot', async () => {
  let saved;
  const invoiceRepo = {
    create: (value) => ({ ...value }),
    save: async (value) => { saved = value; return value; },
  };
  const dataSource = {
    getRepository: () => ({ findOne: async () => ({ id: 'default', percentage: '42.50' }) }),
  };
  const service = new InvoicesService(invoiceRepo, dataSource);
  await service.create(
    { id: 'parcel-3', recipient_id: 'recipient-3', current_hub_id: 'hub-3' },
    { basePostCost: 25000, elapsedHours: 13, feePercentage: 0.4, calculatedFee: 10000 },
  );
  assert.equal(saved.hub_share_percent, 42.5);
  assert.equal(saved.hub_owner_share, 4250);
  assert.equal(saved.hub_share_snapshot.percentage, 42.5);
  assert.equal(saved.hub_share_snapshot.basisAmount, 10000);
});

test('invoice creation refuses unresolved recipient or hub identity', async () => {
  const service = new InvoicesService({ create: (value) => value, save: async (value) => value });
  await assert.rejects(
    service.create({ id: 'parcel-2', recipient_id: null, current_hub_id: 'hub-1' }, { calculatedFee: 10 }),
    (error) => error && error.getStatus && error.getStatus() === 400,
  );
});
