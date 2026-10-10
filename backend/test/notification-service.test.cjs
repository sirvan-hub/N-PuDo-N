const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationsService } = require('../dist/modules/notifications/notifications.service');

test('in-app delivery-code notification is private to its recipient and disappears from inbox at expiry', async () => {
  const now = new Date();
  const rows = [
    { id: 'notification-1', user_id: 'recipient-1', category: 'DELIVERY_CODE', body: 'code 123456', expires_at: new Date(now.getTime() + 60_000), created_at: now, read_at: null },
    { id: 'notification-expired', user_id: 'recipient-1', category: 'DELIVERY_CODE', body: 'old code 111111', expires_at: new Date(now.getTime() - 1_000), created_at: now, read_at: null },
    { id: 'notification-2', user_id: 'recipient-2', category: 'DELIVERY_CODE', body: 'other code 654321', expires_at: new Date(now.getTime() + 60_000), created_at: now, read_at: null },
  ];
  const repository = {
    find: async ({ where, take }) => rows.filter((row) => row.user_id === where.user_id).slice(0, take),
    findOne: async ({ where }) => rows.find((row) => row.id === where.id && row.user_id === where.user_id) || null,
    save: async (row) => row,
  };
  const service = new NotificationsService(repository);
  const inbox = await service.listForUser('recipient-1');
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].body, 'code 123456');
  await assert.rejects(service.markRead('recipient-2', 'notification-1'), (error) => error && error.getStatus && error.getStatus() === 404);
  const read = await service.markRead('recipient-1', 'notification-1');
  assert.ok(read.read_at instanceof Date);
});
