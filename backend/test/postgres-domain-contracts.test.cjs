const test = require('node:test');
const assert = require('node:assert/strict');

const isPostgres = (process.env.DB_TYPE || '').toLowerCase() === 'postgres';

test('domain financial contracts enforce invoice states, idempotency, and custody data shape', async (t) => {
  if (!isPostgres) {
    t.skip('Set DB_TYPE=postgres to run PostgreSQL domain-contract tests');
    return;
  }

  const { Client } = require('pg');
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    await client.query('BEGIN');
    const suffix = Math.random().toString(16).slice(2, 10);
    const user = (await client.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1999${suffix}`, 'RECIPIENT'],
    )).rows[0];
    const hub = (await client.query(
      `INSERT INTO hubs
        (owner_id, name, address, city, operating_hours, qr_code_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
      [user.id, 'CI Contract Hub', 'Test address', 'CI City', '{}', `qr-${suffix}`],
    )).rows[0];
    const parcel = (await client.query(
      `INSERT INTO parcels
        (tracking_code, recipient_phone, recipient_name, recipient_address, base_post_cost, recipient_id, current_hub_id)
       VALUES ($1, $2, $3, $4, 18000, $5, $6) RETURNING id`,
      [`CI-${suffix}`, '+19990000000', 'CI Recipient', 'Test address', user.id, hub.id],
    )).rows[0];

    for (const status of ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'OVERDUE', 'CANCELLED']) {
      await client.query(
        `INSERT INTO invoices
          (invoice_number, parcel_id, recipient_id, hub_id, base_post_cost, elapsed_hours,
           fee_percentage, calculated_fee, total_amount, status, hub_owner_share, platform_fee)
         VALUES ($1, $2, $3, $4, 18000, 1, 20, 3600, 3600, $5, 0, 0)`,
        [`INV-${suffix}-${status}`, parcel.id, user.id, hub.id, status],
      );
    }

    await client.query('SAVEPOINT invalid_invoice_status');
    await assert.rejects(
      client.query(
        `INSERT INTO invoices
          (invoice_number, parcel_id, recipient_id, hub_id, base_post_cost, elapsed_hours,
           fee_percentage, calculated_fee, total_amount, status, hub_owner_share, platform_fee)
         VALUES ($1, $2, $3, $4, 18000, 1, 20, 3600, 3600, 'UNKNOWN', 0, 0)`,
        [`INV-${suffix}-UNKNOWN`, parcel.id, user.id, hub.id],
      ),
      (error) => error.code === '23514',
    );
    await client.query('ROLLBACK TO SAVEPOINT invalid_invoice_status');

    const hash = 'a'.repeat(64);
    const idem = (await client.query(
      `INSERT INTO idempotency_records
        (actor_scope, operation_type, idempotency_key, request_hash, state, response_status, response_body, completed_at)
       VALUES ($1, 'invoice.create', $2, $3, 'COMPLETED', 201, '{}'::jsonb, now())
       RETURNING id`,
      [`user:${user.id}`, `create-${suffix}`, hash],
    )).rows[0];

    await client.query('SAVEPOINT duplicate_idempotency_key');
    await assert.rejects(
      client.query(
        `INSERT INTO idempotency_records
          (actor_scope, operation_type, idempotency_key, request_hash)
         VALUES ($1, 'invoice.create', $2, $3)`,
        [`user:${user.id}`, `create-${suffix}`, 'b'.repeat(64)],
      ),
      (error) => error.code === '23505',
    );
    await client.query('ROLLBACK TO SAVEPOINT duplicate_idempotency_key');
    // The same textual key is allowed for a distinct operation scope.
    await client.query(
      `INSERT INTO idempotency_records
        (actor_scope, operation_type, idempotency_key, request_hash)
       VALUES ($1, 'wallet.credit', $2, $3)`,
      [`user:${user.id}`, `create-${suffix}`, 'c'.repeat(64)],
    );

    const walletIdem = (await client.query(
      `INSERT INTO idempotency_records
        (actor_scope, operation_type, idempotency_key, request_hash, state, response_status, response_body, completed_at)
       VALUES ($1, 'wallet.credit', $2, $3, 'COMPLETED', 200, '{}'::jsonb, now())
       RETURNING id`,
      [`user:${user.id}`, `credit-${suffix}`, 'd'.repeat(64)],
    )).rows[0];
    const wallet = (await client.query(
      'INSERT INTO wallets (user_id, balance, pending_balance, total_earned) VALUES ($1, 5000, 2500, 9000) RETURNING id',
      [user.id],
    )).rows[0];
    await client.query(
      `INSERT INTO wallet_transactions
        (wallet_id, actor_id, idempotency_record_id, transaction_type, bucket, amount, bucket_balance_after)
       VALUES ($1, $2, $3, 'EARNING_CREDIT', 'AVAILABLE', 5000, 5000)`,
      [wallet.id, user.id, walletIdem.id],
    );
    await client.query('SAVEPOINT invalid_ledger_balance');
    await assert.rejects(
      client.query(
        `INSERT INTO wallet_transactions
          (wallet_id, transaction_type, bucket, amount, bucket_balance_after)
         VALUES ($1, 'DEBIT', 'AVAILABLE', -1000, -1000)`,
        [wallet.id],
      ),
      (error) => error.code === '23514',
    );
    await client.query('ROLLBACK TO SAVEPOINT invalid_ledger_balance');

    const salt = '1'.repeat(32);
    const codeHash = '2'.repeat(64);
    await client.query(
      `INSERT INTO custody_transfers
        (parcel_id, from_hub_id, to_hub_id, transfer_type, status, code_salt, code_hash, expires_at)
       VALUES ($1, $2, $2, 'COURIER_TO_HUB', 'PENDING', $3, $4, now() + interval '5 minutes')`,
      [parcel.id, hub.id, salt, codeHash],
    );
    await client.query('SAVEPOINT invalid_custody_hash');
    await assert.rejects(
      client.query(
        `INSERT INTO custody_transfers
          (parcel_id, transfer_type, status, code_salt, code_hash, expires_at)
         VALUES ($1, 'COURIER_TO_HUB', 'PENDING', $2, $3, now() + interval '5 minutes')`,
        [parcel.id, 'not-a-valid-salt', codeHash],
      ),
      (error) => error.code === '23514',
    );
    await client.query('ROLLBACK TO SAVEPOINT invalid_custody_hash');

    const ledgerCount = await client.query('SELECT count(*)::int AS count FROM wallet_transactions WHERE wallet_id = $1', [wallet.id]);
    assert.equal(ledgerCount.rows[0].count, 1);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

test('wallet credit is atomic and concurrent retries return the same result', async (t) => {
  if (!isPostgres) {
    t.skip('Set DB_TYPE=postgres to exercise the real transactional wallet service');
    return;
  }

  const dataSource = require('../dist/database/data-source').default;
  const { WalletsService } = require('../dist/modules/wallets/wallets.service');
  await dataSource.initialize();

  try {
    const suffix = Math.random().toString(16).slice(2, 10);
    const user = await dataSource.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1777${suffix}`, 'RECIPIENT'],
    );
    const userId = user[0].id;
    const service = new WalletsService(dataSource);
    const key = `wallet-credit-${suffix}`;

    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.credit(userId, 2500, key)),
    );
    for (const result of results) {
      assert.equal(result.walletId, results[0].walletId);
      assert.equal(result.balance, 2500);
      assert.equal(result.ledgerTransactionId, results[0].ledgerTransactionId);
    }

    const wallets = await dataSource.query(
      'SELECT balance, total_earned FROM wallets WHERE user_id = $1',
      [userId],
    );
    assert.equal(Number(wallets[0].balance), 2500);
    assert.equal(Number(wallets[0].total_earned), 2500);

    const ledger = await dataSource.query(
      'SELECT count(*)::int AS count, sum(amount)::text AS total FROM wallet_transactions WHERE wallet_id = $1',
      [results[0].walletId],
    );
    assert.equal(ledger[0].count, 1);
    assert.equal(ledger[0].total, '2500');

    await assert.rejects(
      service.credit(userId, 2600, key),
      (error) => error && error.getStatus && error.getStatus() === 409,
    );

    const afterConflict = await dataSource.query(
      'SELECT balance FROM wallets WHERE user_id = $1',
      [userId],
    );
    assert.equal(Number(afterConflict[0].balance), 2500);
  } finally {
    await dataSource.destroy();
  }
});

test('wallet bucket mutations are atomic, idempotent, and prevent overdrafts', async (t) => {
  if (!isPostgres) {
    t.skip('Set DB_TYPE=postgres to exercise PostgreSQL wallet bucket mutations');
    return;
  }

  const dataSource = require('../dist/database/data-source').default;
  const { WalletsService } = require('../dist/modules/wallets/wallets.service');
  await dataSource.initialize();

  try {
    const suffix = Math.random().toString(16).slice(2, 10);
    const rows = await dataSource.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1666${suffix}`, 'HUB_OWNER'],
    );
    const userId = rows[0].id;
    const walletRows = await dataSource.query(
      'INSERT INTO wallets (user_id, balance, pending_balance, blocked_balance, total_earned) VALUES ($1, 1000, 300, 200, 0) RETURNING id',
      [userId],
    );
    const walletId = walletRows[0].id;
    const service = new WalletsService(dataSource);

    const holdKey = `hold-${suffix}`;
    const holds = await Promise.all([
      service.hold(userId, 200, holdKey),
      service.hold(userId, 200, holdKey),
      service.hold(userId, 200, holdKey),
    ]);
    assert.equal(holds[0].balance, 800);
    assert.equal(holds[0].blockedBalance, 400);
    assert.equal(holds[0].ledgerTransactionIds.length, 2);
    assert.deepEqual(holds[1], holds[0]);
    assert.deepEqual(holds[2], holds[0]);

    await service.releaseHold(userId, 50, `release-hold-${suffix}`);
    await service.creditPending(userId, 400, `pending-credit-${suffix}`);
    await service.releasePending(userId, 100, `release-pending-${suffix}`);
    const finalResult = await service.debit(userId, 25, `debit-${suffix}`);

    assert.equal(finalResult.balance, 925);
    assert.equal(finalResult.pendingBalance, 600);
    assert.equal(finalResult.blockedBalance, 350);
    assert.equal(finalResult.totalEarned, 400);

    await assert.rejects(
      service.debit(userId, 926, `overdraft-${suffix}`),
      (error) => error && error.getStatus && error.getStatus() === 400,
    );

    const persisted = await dataSource.query(
      'SELECT balance, pending_balance, blocked_balance, total_earned FROM wallets WHERE id = $1',
      [walletId],
    );
    assert.equal(Number(persisted[0].balance), 925);
    assert.equal(Number(persisted[0].pending_balance), 600);
    assert.equal(Number(persisted[0].blocked_balance), 350);
    assert.equal(Number(persisted[0].total_earned), 400);

    const ledger = await dataSource.query(
      'SELECT count(*)::int AS count FROM wallet_transactions WHERE wallet_id = $1',
      [walletId],
    );
    assert.equal(ledger[0].count, 8);
  } finally {
    await dataSource.destroy();
  }
});

test('additive migration backfills nonzero existing wallet balances as opening ledger entries', async (t) => {
  if (!isPostgres) {
    t.skip('Set DB_TYPE=postgres to run migration rehearsal');
    return;
  }

  // Run down/seed/up inside one transaction so the schema and fixtures are restored on rollback.
  const dataSource = require('../dist/database/data-source').default;
  const { AddDomainFinancialContracts1791630000001 } = require('../dist/database/migrations/1791630000001-AddDomainFinancialContracts');
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  try {
    await new AddDomainFinancialContracts1791630000001().down(runner);
    const suffix = Math.random().toString(16).slice(2, 10);
    const user = (await runner.query(
      'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
      [`+1888${suffix}`, 'RECIPIENT'],
    ))[0];
    const wallet = (await runner.query(
      'INSERT INTO wallets (user_id, balance, pending_balance, total_earned) VALUES ($1, 12000, 4500, 20000) RETURNING id',
      [user.id],
    ))[0];

    await new AddDomainFinancialContracts1791630000001().up(runner);
    const entries = await runner.query(
      'SELECT bucket, amount::text AS amount, bucket_balance_after::text AS balance_after FROM wallet_transactions WHERE wallet_id = $1 ORDER BY bucket',
      [wallet.id],
    );
    assert.deepEqual(entries, [
      { bucket: 'AVAILABLE', amount: '12000', balance_after: '12000' },
      { bucket: 'PENDING', amount: '4500', balance_after: '4500' },
    ]);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await dataSource.destroy();
  }
});
