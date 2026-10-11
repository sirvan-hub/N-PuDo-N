const test = require('node:test');
const assert = require('node:assert/strict');
const { InvoicesService } = require('../dist/modules/invoices/invoices.service');

test('invoice snapshots balanced 30/30/40 allocation with integer rounding', async () => {
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
  assert.equal(result.courier_share, 1080);
  assert.equal(result.hub_owner_share, 1080);
  assert.equal(result.platform_fee, 1441);
  assert.equal(result.hub_share_percent, 30);
  assert.equal(result.revenue_allocation_snapshot.rule, 'fixed-30-30-40-of-pudo-service-charge');
  assert.deepEqual(result.revenue_allocation_snapshot.shares, {
    courier: { percent: 30, amount: 1080 },
    hub: { percent: 30, amount: 1080 },
    platform: { percent: 40, amount: 1441 },
  });
  assert.equal(result.revenue_allocation_snapshot.sumCheck, result.total_amount);
  assert.equal(saved.courier_share, 1080);
  assert.equal(saved.hub_owner_share, 1080);
  assert.equal(saved.platform_fee, 1441);
});

test('invoice allocation does not inherit legacy configurable hub share and snapshots the approved split', async () => {
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
  assert.equal(saved.hub_share_percent, 30);
  assert.equal(saved.courier_share, 3000);
  assert.equal(saved.hub_owner_share, 3000);
  assert.equal(saved.platform_fee, 4000);
  assert.equal(saved.revenue_allocation_snapshot.shares.platform.amount, 4000);
  assert.equal(saved.revenue_allocation_snapshot.sumCheck, 10000);
});

test('invoice creation refuses unresolved recipient or hub identity', async () => {
  const service = new InvoicesService({ create: (value) => value, save: async (value) => value });
  await assert.rejects(
    service.create({ id: 'parcel-2', recipient_id: null, current_hub_id: 'hub-1' }, { calculatedFee: 10 }),
    (error) => error && error.getStatus && error.getStatus() === 400,
  );
});
