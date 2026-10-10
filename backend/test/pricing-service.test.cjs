const test = require('node:test');
const assert = require('node:assert/strict');
const { PricingService } = require('../dist/modules/pricing/pricing.service');

const service = new PricingService();
const deliveredAt = new Date('2026-01-01T00:00:00.000Z');
const atHours = (hours, extraMs = 0) => new Date(deliveredAt.getTime() + hours * 3_600_000 + extraMs);
const calculate = (hours, extraMs = 0, base = 1000) =>
  service.calculate({ delivered_to_hub_at: deliveredAt, base_post_cost: base }, atHours(hours, extraMs));

test('canonical tariff applies 20% strictly before 12 hours', () => {
  assert.equal(calculate(11, 59 * 60_000).feePercentage, 0.2);
  assert.equal(calculate(12).feePercentage, 0.4);
});

test('24 hours remains 40%; any elapsed time after 24 hours starts another 24h tariff interval', () => {
  assert.equal(calculate(24).feePercentage, 0.4);
  assert.equal(calculate(24, 1).feePercentage, 0.9);
  assert.equal(calculate(48).feePercentage, 0.9);
  assert.equal(calculate(48, 1).feePercentage, 1.4);
});

test('168 hours is 340% and marks the parcel expired', () => {
  const result = calculate(168);
  assert.equal(result.feePercentage, 3.4);
  assert.equal(result.calculatedFee, 3400);
  assert.equal(result.isExpired, true);
  assert.equal(calculate(168, -1).isExpired, false);
  const beyondCap = calculate(200);
  assert.equal(beyondCap.feePercentage, 3.4);
  assert.equal(beyondCap.calculatedFee, 3400);
  assert.equal(beyondCap.isExpired, true);
  assert.equal(beyondCap.elapsedHours, 168);
  assert.equal(beyondCap.actualElapsedHours, 200);
  assert.equal(beyondCap.tariffSnapshot.capReached, true);
});

test('money is rounded up to the next whole currency unit', () => {
  assert.equal(calculate(0, 0, 101).calculatedFee, 21);
});

test('invalid base amount and timestamps are rejected', () => {
  assert.throws(() => service.calculate({ delivered_to_hub_at: deliveredAt, base_post_cost: -1 }, atHours(1)));
  assert.throws(() => service.calculate({ delivered_to_hub_at: deliveredAt, base_post_cost: 100 }, atHours(-1)));
  assert.throws(() => service.calculate({ delivered_to_hub_at: 'not-a-date', base_post_cost: 100 }, atHours(1)));
});

test('active database tariff controls package-size base price and invoice tariff snapshot', async () => {
  const activeTariff = {
    id: 'tariff-version-123',
    version_key: 'PUDO-N-TARIFF-168H-V1',
    small_base_amount: '18000',
    medium_base_amount: '25000',
    large_base_amount: '35000',
    under_12h_percent: '20.00',
    from_12_to_24h_percent: '40.00',
    additional_started_24h_percent: '50.00',
    expiry_hours: 168,
    rounding_mode: 'CEIL',
  };
  const db = {
    options: { type: 'postgres' },
    query: async (sql) => {
      assert.match(sql, /FROM tariff_versions/);
      return [activeTariff];
    },
  };
  const activeService = new PricingService(db);
  assert.deepEqual(await activeService.resolveBaseCost('SMALL', atHours(1)), {
    basePostCost: 18000, tariffVersionId: 'tariff-version-123', tariffKey: 'PUDO-N-TARIFF-168H-V1',
  });
  const priced = await activeService.calculateWithActiveTariff({
    package_size: 'LARGE',
    base_post_cost: 1,
    delivered_to_hub_at: deliveredAt,
  }, atHours(13));
  assert.equal(priced.basePostCost, 35000);
  assert.equal(priced.calculatedFee, 14000);
  assert.equal(priced.tariffVersionId, 'tariff-version-123');
  assert.equal(priced.tariffSnapshot.tariffVersionId, 'tariff-version-123');
});
