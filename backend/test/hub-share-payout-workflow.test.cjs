const test = require('node:test');
const assert = require('node:assert/strict');

const isPostgres = (process.env.DB_TYPE || '').toLowerCase() === 'postgres';

test('hub share settings and payout request routes declare the intended role boundaries', () => {
  const { HubShareSettingsController } = require('../dist/modules/hub-share-settings/hub-share-settings.controller');
  const { HubPayoutRequestsController } = require('../dist/modules/settlements/hub-payout-requests.controller');
  const { CourierPayoutRequestsController } = require('../dist/modules/settlements/courier-payout-requests.controller');
  const { PayoutPreferencesController } = require('../dist/modules/settlements/payout-preferences.controller');
  const { UserRole } = require('../dist/common/interfaces/user-payload.interface');
  assert.deepEqual(Reflect.getMetadata('roles', HubShareSettingsController), [UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  assert.deepEqual(Reflect.getMetadata('roles', HubPayoutRequestsController.prototype.request), [UserRole.HUB_OWNER]);
  assert.deepEqual(Reflect.getMetadata('roles', HubPayoutRequestsController.prototype.review), [UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  assert.deepEqual(Reflect.getMetadata('roles', HubPayoutRequestsController.prototype.listQueue), [UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  assert.deepEqual(Reflect.getMetadata('roles', HubPayoutRequestsController.prototype.list), [UserRole.HUB_OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  assert.deepEqual(Reflect.getMetadata('roles', CourierPayoutRequestsController.prototype.request), [UserRole.COURIER]);
  assert.deepEqual(Reflect.getMetadata('roles', CourierPayoutRequestsController.prototype.list), [UserRole.COURIER]);
  assert.deepEqual(Reflect.getMetadata('roles', PayoutPreferencesController.prototype.updateMine), [UserRole.COURIER, UserRole.HUB_OWNER]);
  assert.deepEqual(Reflect.getMetadata('roles', PayoutPreferencesController.prototype.verifyDestination), [UserRole.ADMIN, UserRole.SUPER_ADMIN]);
});

test('hub share configuration records rate changes and preserves default 30%', async (t) => {
  if (!isPostgres) {
    t.skip('Set DB_TYPE=postgres to exercise the persisted hub share settings');
    return;
  }
  const dataSource = require('../dist/database/data-source').default;
  const { HubShareSettingsService } = require('../dist/modules/hub-share-settings/hub-share-settings.service');
  const { UserRole } = require('../dist/common/interfaces/user-payload.interface');
  await dataSource.initialize();
  try {
    const suffix = Math.random().toString(16).slice(2, 10);
    const rows = await dataSource.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1888${suffix}`, 'ADMIN'],
    );
    const actor = { sub: rows[0].id, phone: `+1888${suffix}`, role: UserRole.ADMIN, is_verified: true };
    const service = new HubShareSettingsService(dataSource);
    const before = await service.getCurrent();
    assert.equal(before.percentage, 30);
    const changed = await service.updatePercentage(32.5, 'CI test change', actor);
    assert.equal(changed.previousPercentage, 30);
    assert.equal(changed.percentage, 32.5);
    const history = await service.getHistory(10);
    assert.ok(history.some((item) => item.oldPercentage === 30 && item.newPercentage === 32.5 && item.changedBy === actor.sub));

    // Concurrent updates must serialize so the audit trail forms a continuous rate history.
    await Promise.all([
      service.updatePercentage(31, 'concurrent CI update A', actor),
      service.updatePercentage(33, 'concurrent CI update B', actor),
    ]);
    const concurrentHistory = await service.getHistory(10);
    const concurrentRows = concurrentHistory.filter((item) => [31, 33].includes(item.newPercentage));
    assert.equal(concurrentRows.length, 2);
    const firstUpdate = concurrentRows.find((item) => item.oldPercentage === 32.5);
    assert.ok(firstUpdate, 'one concurrent update must start from the previous rate');
    const secondUpdate = concurrentRows.find((item) => item.oldPercentage === firstUpdate.newPercentage);
    assert.ok(secondUpdate, 'the next audit entry must continue from the preceding rate');
    assert.ok([31, 33].includes(firstUpdate.newPercentage));
    assert.ok([31, 33].includes(secondUpdate.newPercentage));
    assert.notEqual(firstUpdate.newPercentage, secondUpdate.newPercentage);

    await service.updatePercentage(30, 'restore test baseline', actor);
  } finally {
    await dataSource.destroy();
  }
});

test('hub payout request reserves funds, is idempotent, and rejection releases the hold', async (t) => {
  if (!isPostgres) {
    t.skip('Set DB_TYPE=postgres to exercise payout request transactions');
    return;
  }
  const dataSource = require('../dist/database/data-source').default;
  const { HubPayoutRequestsService } = require('../dist/modules/settlements/hub-payout-requests.service');
  const { UserRole } = require('../dist/common/interfaces/user-payload.interface');
  await dataSource.initialize();
  let ownerId, adminId, hubId, walletId;
  try {
    const suffix = Math.random().toString(16).slice(2, 10);
    const ownerRows = await dataSource.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1889${suffix}`, 'HUB_OWNER'],
    );
    const adminRows = await dataSource.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1890${suffix}`, 'ADMIN'],
    );
    ownerId = ownerRows[0].id;
    adminId = adminRows[0].id;
    const hubRows = await dataSource.query(
      `INSERT INTO hubs (owner_id, name, address, city, operating_hours, qr_code_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
      [ownerId, 'Payout CI Hub', 'CI address', 'CI City', '{}', `payout-qr-${suffix}`],
    );
    hubId = hubRows[0].id;
    const walletRows = await dataSource.query(
      'INSERT INTO wallets (user_id, balance, pending_balance, blocked_balance, total_earned) VALUES ($1, 5000, 0, 0, 5000) RETURNING id',
      [ownerId],
    );
    walletId = walletRows[0].id;
    await dataSource.query(
      `INSERT INTO payout_preferences (user_id, frequency, destination_token, destination_last4, destination_verified_at, destination_verified_by, verification_reference) VALUES ($1, 'MONTHLY', $2, '1234', now(), $3, $4)`,
      [ownerId, `provider-token-${suffix}`, adminId, `bank-check-${suffix}`],
    );
    const service = new HubPayoutRequestsService(dataSource);
    const owner = { sub: ownerId, phone: `+1889${suffix}`, role: UserRole.HUB_OWNER, is_verified: true };
    const admin = { sub: adminId, phone: `+1890${suffix}`, role: UserRole.ADMIN, is_verified: true };
    const key = `payout-request-${suffix}`;
    const first = await service.requestPayout(hubId, 2000, key, owner);
    const replay = await service.requestPayout(hubId, 2000, key, owner);
    assert.deepEqual(replay, first);
    assert.equal(first.status, 'REQUESTED');
    assert.equal(first.availableBalance, 3000);
    assert.equal(first.blockedBalance, 2000);

    const balances = await dataSource.query('SELECT balance, blocked_balance FROM wallets WHERE user_id = $1', [ownerId]);
    assert.equal(balances[0].balance, 3000);
    assert.equal(Number(balances[0].blocked_balance), 2000);

    await assert.rejects(
      service.reviewPayout(first.requestId, 'REJECT', 'Owner must not self-review', `owner-review-${suffix}`, owner),
      (error) => error && error.getStatus && error.getStatus() === 403,
      'a hub owner must not approve or reject their own payout request',
    );

    const rejected = await service.reviewPayout(first.requestId, 'REJECT', 'Reject CI request', `review-reject-${suffix}`, admin);
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.fundsReleased, true);
    const restored = await dataSource.query('SELECT balance, blocked_balance FROM wallets WHERE user_id = $1', [ownerId]);
    assert.equal(restored[0].balance, 5000);
    assert.equal(Number(restored[0].blocked_balance), 0);

    const second = await service.requestPayout(hubId, 1000, `payout-request-2-${suffix}`, owner);
    const approved = await service.reviewPayout(second.requestId, 'APPROVE', 'Approve CI request', `review-approve-${suffix}`, admin);
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.fundsReleased, false);
    const held = await dataSource.query('SELECT balance, blocked_balance FROM wallets WHERE user_id = $1', [ownerId]);
    assert.equal(held[0].balance, 4000);
    assert.equal(Number(held[0].blocked_balance), 1000);
    await assert.rejects(
      service.requestPayout(hubId, 500, `payout-request-3-${suffix}`, owner),
      (error) => error && error.getStatus && error.getStatus() === 409,
    );
    await assert.rejects(
      service.requestPayout(hubId, 100, `unauthorized-${suffix}`, admin),
      (error) => error && error.getStatus && error.getStatus() === 403,
    );
  } finally {
    if (hubId) await dataSource.query('DELETE FROM settlement_transactions WHERE hub_id = $1', [hubId]);
    if (walletId) await dataSource.query('DELETE FROM wallet_transactions WHERE wallet_id = $1', [walletId]);
    if (ownerId || adminId) {
      await dataSource.query(
        `DELETE FROM idempotency_records WHERE actor_scope = ANY($1::text[]) AND operation_type IN ('settlement.hub-payout-request', 'settlement.hub-payout-review')`,
        [[ownerId, adminId].filter(Boolean).map((id) => `user:${id}`)],
      );
    }
    if (walletId) await dataSource.query('DELETE FROM wallets WHERE id = $1', [walletId]);
    if (hubId) await dataSource.query('DELETE FROM hubs WHERE id = $1', [hubId]);
    if (ownerId || adminId) await dataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ownerId, adminId].filter(Boolean)]);
    await dataSource.destroy();
  }
});


test('courier payout preference and request workflow is actor-scoped, idempotent, and ledger-backed', async (t) => {
  if (!isPostgres) {
    t.skip('Set DB_TYPE=postgres to exercise payout transactions and versioned migrations');
    return;
  }
  const dataSource = require('../dist/database/data-source').default;
  const { CourierPayoutRequestsService } = require('../dist/modules/settlements/courier-payout-requests.service');
  const { PayoutPreferencesService } = require('../dist/modules/settlements/payout-preferences.service');
  const { HubPayoutRequestsService } = require('../dist/modules/settlements/hub-payout-requests.service');
  const { UserRole } = require('../dist/common/interfaces/user-payload.interface');
  await dataSource.initialize();
  let courierId, adminId, walletId;
  try {
    const suffix = Math.random().toString(16).slice(2, 10);
    const courierRows = await dataSource.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1891${suffix}`, 'COURIER'],
    );
    const adminRows = await dataSource.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1892${suffix}`, 'ADMIN'],
    );
    courierId = courierRows[0].id;
    adminId = adminRows[0].id;
    const walletRows = await dataSource.query(
      'INSERT INTO wallets (user_id, balance, pending_balance, blocked_balance, total_earned) VALUES ($1, 5000, 0, 0, 5000) RETURNING id',
      [courierId],
    );
    walletId = walletRows[0].id;
    const courier = { sub: courierId, phone: `+1891${suffix}`, role: UserRole.COURIER, is_verified: true };
    const admin = { sub: adminId, phone: `+1892${suffix}`, role: UserRole.ADMIN, is_verified: true };
    const preferences = new PayoutPreferencesService(dataSource);
    await preferences.updateMine({
      frequency: 'WEEKLY',
      destinationToken: `provider-token-${suffix}`,
      destinationLast4: '4321',
    }, courier);
    await assert.rejects(
      new CourierPayoutRequestsService(dataSource).requestPayout(1000, `blocked-${suffix}`, courier),
      (error) => error && error.getStatus && error.getStatus() === 409,
      'payout requests must be blocked until destination verification is recorded',
    );
    const verified = await preferences.verifyDestination(courierId, `external-check-${suffix}`, admin);
    assert.equal(verified.destinationVerified, true);
    assert.equal(verified.frequency, 'WEEKLY');
    await preferences.updateMine({ destinationToken: `provider-token-changed-${suffix}`, destinationLast4: '4321' }, courier);
    const afterDestinationChange = await preferences.getMine(courier);
    assert.equal(afterDestinationChange.destinationVerified, false, 'changing destination must invalidate previous verification');
    await preferences.verifyDestination(courierId, `external-check-renewed-${suffix}`, admin);

    const service = new CourierPayoutRequestsService(dataSource);
    const key = `courier-payout-${suffix}`;
    const first = await service.requestPayout(2000, key, courier);
    const replay = await service.requestPayout(2000, key, courier);
    assert.deepEqual(replay, first);
    assert.equal(first.status, 'REQUESTED');
    assert.equal(first.frequency, 'WEEKLY');
    assert.equal(first.availableBalance, 3000);
    assert.equal(first.blockedBalance, 2000);
    assert.equal((await service.listForCourier(courier)).length, 1);

    const reviewer = new HubPayoutRequestsService(dataSource);
    const rejected = await reviewer.reviewPayout(first.requestId, 'REJECT', 'Reject courier CI request', `review-courier-${suffix}`, admin);
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.courierId, courierId);
    assert.equal(rejected.fundsReleased, true);
    const restored = await dataSource.query('SELECT balance, blocked_balance FROM wallets WHERE user_id = $1', [courierId]);
    assert.equal(restored[0].balance, 5000);
    assert.equal(Number(restored[0].blocked_balance), 0);

    const second = await service.requestPayout(1000, `courier-payout-2-${suffix}`, courier);
    const approved = await reviewer.reviewPayout(second.requestId, 'APPROVE', 'Approve but do not transfer', `review-courier-approve-${suffix}`, admin);
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.fundsReleased, false);
    const held = await dataSource.query('SELECT balance, blocked_balance FROM wallets WHERE user_id = $1', [courierId]);
    assert.equal(held[0].balance, 4000);
    assert.equal(Number(held[0].blocked_balance), 1000);
  } finally {
    if (courierId) await dataSource.query('DELETE FROM settlement_transactions WHERE requested_by = $1 AND transaction_type = \'COURIER_PAYOUT\'', [courierId]);
    if (walletId) await dataSource.query('DELETE FROM wallet_transactions WHERE wallet_id = $1', [walletId]);
    if (courierId || adminId) {
      await dataSource.query(
        `DELETE FROM idempotency_records WHERE actor_scope = ANY($1::text[]) AND operation_type IN ('settlement.courier-payout-request', 'settlement.hub-payout-review')`,
        [[courierId, adminId].filter(Boolean).map((id) => `user:${id}`)],
      );
    }
    if (walletId) await dataSource.query('DELETE FROM wallets WHERE id = $1', [walletId]);
    if (courierId || adminId) await dataSource.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[courierId, adminId].filter(Boolean)]);
    await dataSource.destroy();
  }
});
