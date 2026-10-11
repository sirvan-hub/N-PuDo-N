const test = require('node:test');
const assert = require('node:assert/strict');
const { ParcelsService } = require('../dist/modules/parcels/parcels.service');
const { ParcelEntity } = require('../dist/database/entities/parcel.entity');
const { NetworkEntryChargeEntity, NetworkEntryChargeStatus } = require('../dist/database/entities/network-entry-charge.entity');
const { NotificationEntity } = require('../dist/database/entities/notification.entity');
const { AuditLogEntity } = require('../dist/database/entities/audit-log.entity');
const { UserRole } = require('../dist/common/interfaces/user-payload.interface');

function setup(status = NetworkEntryChargeStatus.PENDING_RECEIPT) {
  const parcel = { id: 'parcel-1', recipient_id: 'recipient-1', recipient_phone: '+989120000001', courier_id: 'courier-1' };
  const charge = {
    id: 'entry-charge-1', parcel_id: parcel.id, status,
    amount: 5400, postal_postage_amount: 18000, fee_percent: 30,
    receipt_evidence_ref: status === NetworkEntryChargeStatus.RECEIPT_SUBMITTED ? 'private-receipt-object-001' : null,
  };
  const saved = { notifications: [], audits: [] };
  const manager = {
    getRepository(entity) {
      if (entity === ParcelEntity) return { findOne: async () => parcel };
      if (entity === NetworkEntryChargeEntity) return {
        findOne: async ({ where }) => where.provider_reference ? null : charge,
        save: async (value) => value,
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
  const service = new ParcelsService(
    { findOne: async () => parcel }, {}, {}, { transaction: async (work) => work(manager), getRepository: () => ({ find: async () => [] }) }, {}, {},
  );
  return { service, parcel, charge, saved };
}

test('recipient receipt submission is scoped and moves the entry charge into review', async () => {
  const { service, charge, saved } = setup();
  const result = await service.submitNetworkEntryReceipt('parcel-1', 'private-receipt-object-001', {
    sub: 'recipient-1', phone: '+989120000001', role: UserRole.RECIPIENT,
  });
  assert.equal(result.alreadySubmitted, false);
  assert.equal(charge.status, NetworkEntryChargeStatus.RECEIPT_SUBMITTED);
  assert.equal(charge.receipt_evidence_ref, 'private-receipt-object-001');
  assert.equal(saved.audits[0].action, 'NETWORK_ENTRY_RECEIPT_SUBMITTED');
});

test('admin reconciliation verifies an entry fee and enables hub selection only after review', async () => {
  const { service, charge, saved } = setup(NetworkEntryChargeStatus.RECEIPT_SUBMITTED);
  const result = await service.verifyNetworkEntryPayment('entry-charge-1', 'bank-reference-ci-001', {
    sub: 'admin-1', phone: '+989120000099', role: UserRole.ADMIN,
  });
  assert.equal(result.alreadyVerified, false);
  assert.equal(result.hubSelectionEnabled, true);
  assert.equal(charge.status, NetworkEntryChargeStatus.VERIFIED);
  assert.equal(charge.provider_reference, 'bank-reference-ci-001');
  assert.equal(saved.notifications.length, 2);
  assert.equal(saved.audits[0].action, 'NETWORK_ENTRY_PAYMENT_RECONCILED');
});

test('entry-fee verification rejects receipt-only or unauthorized approval', async () => {
  const { service } = setup();
  await assert.rejects(
    service.verifyNetworkEntryPayment('entry-charge-1', 'bank-reference-ci-002', {
      sub: 'recipient-1', phone: '+989120000001', role: UserRole.RECIPIENT,
    }),
    (error) => error && error.getStatus && error.getStatus() === 403,
  );
});
