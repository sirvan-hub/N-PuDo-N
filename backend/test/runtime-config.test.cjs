const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePort, resolveCorsOrigins, requireJwtSecret } = require('../dist/config/runtime-config.js');

test('PORT defaults to 3000 and accepts a valid host port', () => {
  assert.equal(resolvePort(undefined), 3000);
  assert.equal(resolvePort('10000'), 10000);
});

test('PORT rejects invalid values', () => {
  for (const value of ['', '0', '-1', '65536', '1.5', 'abc']) {
    assert.throws(() => resolvePort(value), /PORT must be an integer/);
  }
});

test('CORS origins default locally and parse comma-separated exact origins', () => {
  assert.deepEqual(resolveCorsOrigins(undefined), ['http://localhost:5173']);
  assert.deepEqual(
    resolveCorsOrigins('https://pudo.example, https://admin.example'),
    ['https://pudo.example', 'https://admin.example'],
  );
});

test('CORS origins reject wildcard, invalid protocols, and URL paths', () => {
  for (const value of ['*', 'ftp://pudo.example', 'https://pudo.example/app']) {
    assert.throws(() => resolveCorsOrigins(value), /CORS_ORIGINS/);
  }
});

test('JWT_SECRET requires at least 32 characters', () => {
  assert.throws(() => requireJwtSecret(undefined), /JWT_SECRET is required/);
  assert.throws(() => requireJwtSecret('too-short'), /JWT_SECRET is required/);
  const secret = '0123456789abcdef0123456789abcdef';
  assert.equal(requireJwtSecret(secret), secret);
});
