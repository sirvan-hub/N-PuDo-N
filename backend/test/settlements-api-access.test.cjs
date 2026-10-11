const test = require('node:test');
const assert = require('node:assert/strict');

const isPostgres = (process.env.DB_TYPE || '').toLowerCase() === 'postgres';

test('settlement mutation API is restricted to administrator roles', () => {
  const { SettlementsController } = require('../dist/modules/settlements/settlements.controller');
  const { UserRole } = require('../dist/common/interfaces/user-payload.interface');
  const guards = Reflect.getMetadata('__guards__', SettlementsController) || [];
  const roles = Reflect.getMetadata('roles', SettlementsController);
  assert.equal(guards.length, 2);
  assert.deepEqual(roles, [UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  assert.equal(typeof SettlementsController.prototype.confirmInvoicePayment, 'function');
});

test('verified invoice payment reconciliation is atomic and idempotent', async (t) => {
  if (!isPostgres) {
    t.skip('Set DB_TYPE=postgres to exercise PostgreSQL settlement reconciliation');
    return;
  }

  const dataSource = require('../dist/database/data-source').default;
  const { SettlementsService } = require('../dist/modules/settlements/settlements.service');
  const { UserRole } = require('../dist/common/interfaces/user-payload.interface');
  await dataSource.initialize();

  try {
    const suffix = Math.random().toString(16).slice(2, 10);
    const users = await dataSource.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1777${suffix}`, 'ADMIN'],
    );
    const actorId = users[0].id;
    const recipientRows = await dataSource.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1778${suffix}`, 'RECIPIENT'],
    );
    const recipientId = recipientRows[0].id;
    const hubRows = await dataSource.query(
      `INSERT INTO hubs (owner_id, name, address, city, operating_hours, qr_code_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
      [actorId, 'Settlement CI Hub', 'CI address', 'CI City', '{}', `settlement-qr-${suffix}`],
    );
    const parcelRows = await dataSource.query(
      `INSERT INTO parcels
        (tracking_code, recipient_phone, recipient_name, recipient_address, base_post_cost, recipient_id, current_hub_id)
       VALUES ($1, $2, $3, $4, 18000, $5, $6) RETURNING id`,
      [`SETTLE-${suffix}`, `+1778${suffix}`, 'Recipient', 'CI address', recipientId, hubRows[0].id],
    );
    const invoiceRows = await dataSource.query(
      `INSERT INTO invoices
        (invoice_number, parcel_id, recipient_id, hub_id, base_post_cost, elapsed_hours, fee_percentage,
         calculated_fee, total_amount, status, hub_owner_share, platform_fee)
       VALUES ($1, $2, $3, $4, 18000, 1, 20, 3600, 3600, 'PENDING', 0, 0) RETURNING id`,
      [`INV-SETTLE-${suffix}`, parcelRows[0].id, recipientId, hubRows[0].id],
    );
    const service = new SettlementsService(dataSource);
    const actor = { sub: actorId, phone: `+1777${suffix}`, role: UserRole.ADMIN, is_verified: true };
    const key = `reconcile-${suffix}`;
    const first = await service.recordVerifiedInvoicePayment(invoiceRows[0].id, `provider-${suffix}`, key, actor);
    const replay = await service.recordVerifiedInvoicePayment(invoiceRows[0].id, `provider-${suffix}`, key, actor);
    assert.deepEqual(replay, first);
    assert.equal(first.status, 'COMPLETED');
    assert.equal(first.invoiceStatus, 'PAID');
    assert.equal(first.amount, 3600);

    const invoiceState = await dataSource.query('SELECT status, paid_at FROM invoices WHERE id = $1', [invoiceRows[0].id]);
    assert.equal(invoiceState[0].status, 'PAID');
    assert.ok(invoiceState[0].paid_at);

    const settlementCount = await dataSource.query(
      'SELECT count(*)::int AS count FROM settlement_transactions WHERE invoice_id = $1',
      [invoiceRows[0].id],
    );
    assert.equal(settlementCount[0].count, 1);
    const auditCount = await dataSource.query(
      "SELECT count(*)::int AS count FROM audit_logs WHERE entity_id = $1 AND action = 'INVOICE_PAYMENT_RECONCILED'",
      [invoiceRows[0].id],
    );
    assert.equal(auditCount[0].count, 1);

    await assert.rejects(
      service.recordVerifiedInvoicePayment(invoiceRows[0].id, `other-provider-${suffix}`, `new-key-${suffix}`, actor),
      (error) => error && error.getStatus && error.getStatus() === 409,
    );
  } finally {
    await dataSource.destroy();
  }
});
