const test = require('node:test');
const assert = require('node:assert/strict');

test('PostgreSQL CI connection is configured and usable', async (t) => {
  if ((process.env.DB_TYPE || '').toLowerCase() !== 'postgres') {
    t.skip('Set DB_TYPE=postgres to run this integration smoke test');
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
    const result = await client.query('SELECT current_database() AS database, current_timestamp AS now');
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].database, process.env.DB_NAME);
    assert.ok(result.rows[0].now);
  } finally {
    await client.end();
  }
});
