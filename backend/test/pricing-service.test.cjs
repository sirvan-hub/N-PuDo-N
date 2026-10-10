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
});

test('money is rounded up to the next whole currency unit', () => {
  assert.equal(calculate(0, 0, 101).calculatedFee, 21);
});

test('invalid base amount and timestamps are rejected', () => {
  assert.throws(() => service.calculate({ delivered_to_hub_at: deliveredAt, base_post_cost: -1 }, atHours(1)));
  assert.throws(() => service.calculate({ delivered_to_hub_at: deliveredAt, base_post_cost: 100 }, atHours(-1)));
  assert.throws(() => service.calculate({ delivered_to_hub_at: 'not-a-date', base_post_cost: 100 }, atHours(1)));
});
