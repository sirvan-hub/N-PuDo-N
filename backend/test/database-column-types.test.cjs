const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../dist/database/database-column-types.js');

test('database column types remain SQLite-compatible for local development', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const t = require(process.argv[1]);
    process.stdout.write(JSON.stringify(t));
  `, modulePath], {
    encoding: 'utf8',
    env: { ...process.env, DB_TYPE: 'sqlite' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    databaseUuidColumnType: 'varchar',
    databaseDateColumnType: 'datetime',
    databaseJsonColumnType: 'simple-json',
  });
});

test('database column types select PostgreSQL-native types for durable environments', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const t = require(process.argv[1]);
    process.stdout.write(JSON.stringify(t));
  `, modulePath], {
    encoding: 'utf8',
    env: { ...process.env, DB_TYPE: 'postgres' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    databaseUuidColumnType: 'uuid',
    databaseDateColumnType: 'timestamptz',
    databaseJsonColumnType: 'jsonb',
  });
});
