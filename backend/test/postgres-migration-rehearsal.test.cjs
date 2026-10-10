const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

function client() {
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

test('migrated core schema accepts a relational test-data rehearsal and rolls it back', async () => {
  const db = client();
  await db.connect();
  try {
    const tables = await db.query(`
      SELECT
        to_regclass('public.users') AS users,
        to_regclass('public.hubs') AS hubs,
        to_regclass('public.parcels') AS parcels,
        to_regclass('public.invoices') AS invoices,
        to_regclass('public.wallets') AS wallets
    `);
    for (const table of ['users', 'hubs', 'parcels', 'invoices', 'wallets']) {
      assert.ok(tables.rows[0][table], `expected migrated table: ${table}`);
    }

    await db.query('BEGIN');
    const ownerId = randomUUID();
    const recipientId = randomUUID();
    const courierId = randomUUID();
    const hubId = randomUUID();
    const parcelId = randomUUID();

    await db.query(
      'INSERT INTO users (id, phone, full_name, role) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12)',
      [ownerId, '+989120000001', 'Test Hub Owner', 'HUB_OWNER',
       recipientId, '+989120000002', 'Test Recipient', 'RECIPIENT',
       courierId, '+989120000003', 'Test Courier', 'COURIER'],
    );
    await db.query(
      'INSERT INTO hubs (id, owner_id, name, address, city, operating_hours, qr_code_hash) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)',
      [hubId, ownerId, 'CI Test Hub', 'Test address', 'Test city', JSON.stringify({ mon: { open: '09:00', close: '18:00' } }), 'ci-' + hubId],
    );
    await db.query(
      'INSERT INTO parcels (id, tracking_code, recipient_phone, recipient_name, recipient_address, base_post_cost, proposed_hub_id, recipient_id, current_hub_id, courier_id, delivered_to_hub_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())',
      [parcelId, 'CI-' + parcelId, '+989120000002', 'Test Recipient', 'Test address', 50000, hubId, recipientId, hubId, courierId],
    );
    const canonicalStatuses = [
      'PENDING_APPROVAL', 'DELIVERY_ATTEMPT', 'CUSTOMER_REQUEST', 'FAILED_DELIVERY',
      'PUDO_ELIGIBILITY', 'HUB_SELECTED', 'HANDOVER_IN_PROGRESS', 'TRANSFERRED_TO_HUB',
      'STORED_AT_HUB', 'READY_FOR_CUSTOMER', 'CUSTOMER_COLLECTION', 'COLLECTED',
      'DELIVERED', 'SETTLEMENT',
    ];
    for (const status of canonicalStatuses) {
      await db.query(
        'INSERT INTO parcels (id, tracking_code, recipient_phone, recipient_name, recipient_address, base_post_cost, status, proposed_hub_id, recipient_id, current_hub_id, courier_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [randomUUID(), 'CI-' + randomUUID(), '+989120000002', 'Test Recipient', 'Test address', 50000, status, hubId, recipientId, hubId, courierId],
      );
    }

    await db.query('SAVEPOINT invalid_parcel_status');
    await assert.rejects(
      db.query(
        'INSERT INTO parcels (tracking_code, recipient_phone, recipient_name, recipient_address, base_post_cost, status) VALUES ($1, $2, $3, $4, $5, $6)',
        ['CI-invalid-' + randomUUID(), '+989120000099', 'Invalid Status Test', 'Test address', 1000, 'NOT_A_CANONICAL_STATUS'],
      ),
      /ck_parcels_status_valid|check constraint/i,
    );
    await db.query('ROLLBACK TO SAVEPOINT invalid_parcel_status');

    await db.query(
      'INSERT INTO invoices (invoice_number, parcel_id, recipient_id, hub_id, base_post_cost, elapsed_hours, fee_percentage, calculated_fee, total_amount, hub_owner_share, platform_fee) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      ['CI-' + parcelId.replace(/-/g, '').slice(0, 20), parcelId, recipientId, hubId, 50000, 12, 40, 20000, 20000, 14000, 6000],
    );
    await db.query('INSERT INTO wallets (user_id, balance, pending_balance, total_earned) VALUES ($1, $2, $3, $4)', [ownerId, 14000, 0, 14000]);

    const result = await db.query(`
      SELECT p.status, h.operating_hours->'mon'->>'open' AS hub_open,
             i.total_amount, w.balance
      FROM parcels p
      JOIN hubs h ON h.id = p.current_hub_id
      JOIN invoices i ON i.parcel_id = p.id
      JOIN wallets w ON w.user_id = h.owner_id
      WHERE p.id = $1
    `, [parcelId]);
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].status, 'DELIVERY_ATTEMPT');
    assert.equal(result.rows[0].hub_open, '09:00');
    assert.equal(Number(result.rows[0].total_amount), 20000);
    assert.equal(result.rows[0].balance, 14000);
  } finally {
    try { await db.query('ROLLBACK'); } catch {}
    await db.end();
  }
});
