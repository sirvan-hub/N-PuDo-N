const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabaseOptions } = require('../dist/database/database-options.js');

test('defaults to SQLite for non-production local development', () => {
  const options = createDatabaseOptions({ NODE_ENV: 'development' });
  assert.equal(options.type, 'sqlite');
  assert.equal(options.database, 'dev.db');
  assert.equal(options.synchronize, true);
  assert.equal(options.migrationsRun, false);
});

test('blocks SQLite in production', () => {
  assert.throws(() => createDatabaseOptions({ NODE_ENV: 'production' }), /SQLite is blocked/);
});

test('PostgreSQL requires all connection settings', () => {
  assert.throws(() => createDatabaseOptions({ DB_TYPE: 'postgres', DB_HOST: 'localhost' }), /requires DB_HOST, DB_NAME, DB_USER and DB_PASSWORD/);
});

test('PostgreSQL disables schema synchronization and automatic migration', () => {
  const options = createDatabaseOptions({ NODE_ENV: 'test', DB_TYPE: 'postgres', DB_HOST: 'localhost', DB_NAME: 'pudo_test', DB_USER: 'pudo_test', DB_PASSWORD: 'test-only' });
  assert.equal(options.type, 'postgres');
  assert.equal(options.synchronize, false);
  assert.equal(options.migrationsRun, false);
});

test('rejects synchronize=true for PostgreSQL', () => {
  assert.throws(() => createDatabaseOptions({ DB_TYPE: 'postgres', DB_HOST: 'localhost', DB_NAME: 'pudo_test', DB_USER: 'pudo_test', DB_PASSWORD: 'test-only', TYPEORM_SYNCHRONIZE: 'true' }), /forbidden for PostgreSQL/);
});

test('rejects unknown database driver', () => {
  assert.throws(() => createDatabaseOptions({ DB_TYPE: 'mysql' }), /Unsupported DB_TYPE/);
});
