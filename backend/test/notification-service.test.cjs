const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationsService } = require('../dist/modules/notifications/notifications.service');

test('in-app delivery-code notification is private, expires from inbox, and has its plaintext scrubbed', async () => {
  const now = new Date();
  const rows = [
    { id: 'notification-1', user_id: 'recipient-1', category: 'DELIVERY_CODE', title: 'Delivery code', body: 'code 123456', expires_at: new Date(now.getTime() + 60_000), created_at: now, read_at: null },
    { id: 'notification-expired', user_id: 'recipient-1', category: 'DELIVERY_CODE', title: 'Delivery code', body: 'old code 111111', expires_at: new Date(now.getTime() - 1_000), created_at: now, read_at: null },
    { id: 'notification-2', user_id: 'recipient-2', category: 'DELIVERY_CODE', title: 'Delivery code', body: 'other code 654321', expires_at: new Date(now.getTime() + 60_000), created_at: now, read_at: null },
  ];
  const repository = {
    update: async (criteria, replacement) => {
      for (const row of rows) {
        const expiry = row.expires_at && new Date(row.expires_at).getTime();
        if (row.category === criteria.category && expiry !== false && expiry != null &&
            expiry <= criteria.expires_at._value.getTime()) {
          Object.assign(row, replacement);
        }
      }
      return { affected: rows.filter((row) => row.title === replacement.title).length };
    },
    find: async ({ where, take }) => rows.filter((row) => row.user_id === where.user_id).slice(0, take),
    findOne: async ({ where }) => rows.find((row) => row.id === where.id && row.user_id === where.user_id) || null,
    save: async (row) => row,
  };
  const service = new NotificationsService(repository);
  const inbox = await service.listForUser('recipient-1');
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].body, 'code 123456');
  assert.equal(rows.find((row) => row.id === 'notification-expired').body, 'این کد منقضی شده و دیگر قابل استفاده نیست.');
  assert.equal(rows.find((row) => row.id === 'notification-expired').body.includes('111111'), false);
  await assert.rejects(service.markRead('recipient-2', 'notification-1'), (error) => error && error.getStatus && error.getStatus() === 404);
  const read = await service.markRead('recipient-1', 'notification-1');
  assert.ok(read.read_at instanceof Date);
});
