const test = require('node:test');
const assert = require('node:assert/strict');
const { ParcelsService } = require('../dist/modules/parcels/parcels.service');
const { ParcelInvitationEntity, ParcelInvitationStatus } = require('../dist/database/entities/parcel-invitation.entity');
const { NotificationEntity } = require('../dist/database/entities/notification.entity');
const { AuditLogEntity } = require('../dist/database/entities/audit-log.entity');
const { UserEntity } = require('../dist/database/entities/user.entity');
const { UserRole } = require('../dist/common/interfaces/user-payload.interface');

function setup() {
  const recipient = { id: 'recipient-1', phone: '+989120000001', role: UserRole.RECIPIENT, is_active: true };
  const invitation = {
    id: 'invitation-1', courier_id: 'courier-1', recipient_id: recipient.id,
    recipient_phone: recipient.phone, status: ParcelInvitationStatus.PENDING,
  };
  const saved = { invitations: [], notifications: [], audits: [] };
  const manager = {
    getRepository(entity) {
      if (entity === UserEntity) return { findOne: async () => recipient };
      if (entity === ParcelInvitationEntity) return {
        create: (value) => ({ ...value, id: invitation.id }),
        save: async (value) => { saved.invitations.push(value); return value; },
        findOne: async () => invitation,
        update: async (_where, patch) => { Object.assign(invitation, patch); return { affected: 1 }; },
      };
      if (entity === NotificationEntity) return {
        create: (value) => ({ ...value }),
        save: async (value) => { saved.notifications.push(value); return value; },
      };
      if (entity === AuditLogEntity) return {
        create: (value) => ({ ...value }),
        save: async (value) => { saved.audits.push(value); return value; },
      };
      throw new Error('Unexpected repository');
    },
  };
  const dataSource = { transaction: async (work) => work(manager) };
  const service = new ParcelsService({}, {}, { findOne: async () => recipient }, dataSource, {}, {});
  return { service, recipient, invitation, saved };
}

test('courier invitation is sent to the recipient private inbox and audited', async () => {
  const { service, recipient, saved } = setup();
  const result = await service.createInvitation(recipient.phone, {
    sub: 'courier-1', phone: '+989120000099', role: UserRole.COURIER, is_verified: true,
  });
  assert.equal(result.status, ParcelInvitationStatus.PENDING);
  assert.equal(saved.invitations.length, 1);
  assert.equal(saved.notifications.length, 1);
  assert.equal(saved.notifications[0].user_id, recipient.id);
  assert.equal(saved.notifications[0].category, 'PARCEL_INVITATION');
  assert.equal(saved.audits[0].action, 'PARCEL_INVITATION_CREATED');
});

test('recipient acceptance is actor-scoped, single-response, and notifies the courier', async () => {
  const { service, invitation, saved } = setup();
  const result = await service.respondToInvitation(invitation.id, true, {
    sub: 'recipient-1', phone: invitation.recipient_phone, role: UserRole.RECIPIENT, is_verified: true,
  });
  assert.equal(result.status, ParcelInvitationStatus.ACCEPTED);
  assert.ok(result.accepted_at instanceof Date);
  assert.equal(invitation.status, ParcelInvitationStatus.ACCEPTED);
  assert.equal(saved.notifications[0].user_id, 'courier-1');
  assert.equal(saved.notifications[0].category, 'PARCEL_INVITATION_RESPONSE');
  assert.equal(saved.audits[0].action, 'PARCEL_INVITATION_ACCEPTED');
});

test('a second invitation response is rejected', async () => {
  const { service, invitation } = setup();
  invitation.status = ParcelInvitationStatus.REJECTED;
  invitation.responded_at = new Date();
  await assert.rejects(
    service.respondToInvitation(invitation.id, true, {
      sub: 'recipient-1', phone: invitation.recipient_phone, role: UserRole.RECIPIENT, is_verified: true,
    }),
    (error) => error && error.getStatus && error.getStatus() === 409,
  );
});
