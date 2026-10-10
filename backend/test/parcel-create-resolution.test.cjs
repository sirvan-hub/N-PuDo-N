const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { ParcelsService } = require('../dist/modules/parcels/parcels.service');
const { ParcelStatus } = require('../dist/modules/parcels/parcel-state-machine');
const { ParcelEntity } = require('../dist/database/entities/parcel.entity');
const { ParcelInvitationEntity, ParcelInvitationStatus } = require('../dist/database/entities/parcel-invitation.entity');
const { NetworkEntryChargeEntity, NetworkEntryChargeStatus } = require('../dist/database/entities/network-entry-charge.entity');
const { RevenueAllocationEntity } = require('../dist/database/entities/revenue-allocation.entity');
const { HubEntity } = require('../dist/database/entities/hub.entity');
const { InvoiceEntity } = require('../dist/database/entities/invoice.entity');
const { CustodyTransferEntity, CustodyTransferStatus, CustodyTransferType } = require('../dist/database/entities/custody-transfer.entity');
const { AuditLogEntity } = require('../dist/database/entities/audit-log.entity');
const { NotificationEntity } = require('../dist/database/entities/notification.entity');
const { UserRole } = require('../dist/common/interfaces/user-payload.interface');

const dto = {
  invitation_id: 'invitation-accepted-1',
  barcode: 'BC-CI-001',
  postal_postage_amount: 18000,
  sender_name: 'CI Sender',
  sender_phone: '+989120000002',
  label_image_ref: 'private-label-object-001',
  tracking_code: 'TRACK-CI-001',
  recipient_phone: '+989120000001',
  recipient_name: 'CI Recipient',
  recipient_address: 'Test address',
  base_post_cost: 18000,
  proposed_hub_id: 'hub-1',
};

function makeService({ recipient = { id: 'recipient-1', phone: dto.recipient_phone, role: UserRole.RECIPIENT, is_active: true }, hub = { id: 'hub-1', is_active: true, is_temporarily_closed: false } } = {}) {
  const saved = [];
  const entryCharges = [];
  const manager = { getRepository(entity) {
    if (entity === ParcelEntity) return { create: (value) => ({ ...value, id: value.id || 'parcel-created-1' }), save: async (value) => { saved.push(value); return value; } };
    if (entity === ParcelInvitationEntity) return { findOne: async () => ({ id: dto.invitation_id, courier_id: 'courier-1', recipient_id: 'recipient-1', recipient_phone: dto.recipient_phone, status: ParcelInvitationStatus.ACCEPTED, responded_at: new Date() }), update: async () => ({ affected: 1 }) };
    if (entity === NetworkEntryChargeEntity) return { create: (value) => ({ ...value }), save: async (value) => { entryCharges.push(value); return value; } };
    if (entity === NotificationEntity) return { create: (value) => ({ ...value }), save: async (value) => value };
    if (entity === AuditLogEntity) return { create: (value) => value, save: async (value) => value };
    throw new Error('Unexpected repository in makeService');
  } };
  const service = new ParcelsService(
    { create: (value) => ({ ...value }), save: async (value) => { saved.push(value); return value; }, findOne: async () => null },
    { findOne: async () => hub },
    { findOne: async () => recipient },
    { transaction: async (work) => work(manager) },
    { resolveBaseCost: async () => ({ basePostCost: 25000, tariffVersionId: 'tariff-v1' }),
      calculate: () => ({ basePostCost: 18000, elapsedHours: 0, feePercentage: 0.2, calculatedFee: 3600, isExpired: false }),
      calculateWithActiveTariff: async () => ({ basePostCost: 18000, elapsedHours: 13, feePercentage: 0.4, calculatedFee: 7200, isExpired: false, tariffVersionId: 'tariff-v1', tariffSnapshot: { tariffKey: 'PUDO-N-TARIFF-168H-V1', appliedPercentage: 40 } }) },
    { create: async (parcel, pricing, manager) => ({ parcel_id: parcel.id, hub_id: parcel.current_hub_id, snapshot: { percentage: 30 }, amount: pricing.calculatedFee }) },
  );
  return { service, saved, entryCharges };
}

test('parcel creation resolves recipient and validates the proposed hub without claiming custody', async () => {
  const { service, saved, entryCharges } = makeService();
  const parcel = await service.create(dto, 'courier-1');
  assert.equal(parcel.recipient_id, 'recipient-1');
  assert.equal(parcel.proposed_hub_id, 'hub-1');
  assert.equal(parcel.current_hub_id, null);
  assert.equal(parcel.courier_id, 'courier-1');
  assert.equal(parcel.status, ParcelStatus.DELIVERY_ATTEMPT);
  assert.equal(parcel.base_post_cost, 25000);
  assert.equal(parcel.tariff_version_id, 'tariff-v1');
  assert.equal(saved.length, 1);
  assert.equal(entryCharges.length, 1);
  assert.equal(entryCharges[0].postal_postage_amount, 18000);
  assert.equal(entryCharges[0].amount, 5400);
  assert.equal(entryCharges[0].status, NetworkEntryChargeStatus.PENDING_RECEIPT);
});

test('parcel registration rejects missing recipient consent invitation', async () => {
  const { service } = makeService();
  const { invitation_id, ...withoutInvitation } = dto;
  await assert.rejects(
    service.create(withoutInvitation, 'courier-1'),
    (error) => error && error.getStatus && error.getStatus() === 400,
  );
});

test('parcel creation rejects an unregistered recipient', async () => {
  const { service } = makeService({ recipient: null });
  await assert.rejects(service.create(dto, 'courier-1'), (error) => error && error.getStatus && error.getStatus() === 400);
});

test('parcel registration does not require hub selection before entry-fee verification', async () => {
  const { service } = makeService({ hub: null });
  const { proposed_hub_id, ...registrationWithoutHub } = dto;
  const parcel = await service.create(registrationWithoutHub, 'courier-1');
  assert.equal(parcel.proposed_hub_id, undefined);
  assert.equal(parcel.status, ParcelStatus.DELIVERY_ATTEMPT);
});


test('hub receipt evidence alone does not finalize custody before courier confirmation', async () => {
  const parcel = {
    id: 'parcel-1', recipient_id: 'recipient-1', recipient_phone: dto.recipient_phone,
    proposed_hub_id: 'hub-1', current_hub_id: null, delivered_to_hub_at: null,
    base_post_cost: 18000, status: ParcelStatus.HUB_SELECTED, courier_id: 'courier-1',
  };
  const hub = { id: 'hub-1', owner_id: 'owner-1', is_active: true, is_temporarily_closed: false };
  const invoiceRepo = { findOne: async () => null };
  const manager = {
    getRepository(entity) {
      if (entity === ParcelEntity) return { findOne: async () => parcel, save: async (value) => value };
      if (entity === HubEntity) return { findOne: async () => hub };
      if (entity === InvoiceEntity) return invoiceRepo;
      if (entity === AuditLogEntity) return { create: (value) => value, save: async (value) => value };
      throw new Error('Unexpected repository');
    },
  };
  let transactionCalled = false;
  const service = new ParcelsService(
    { findOne: async () => parcel },
    { findOne: async () => hub },
    { findOne: async () => ({ id: 'recipient-1' }) },
    { transaction: async (work) => { transactionCalled = true; return work(manager); } },
    { resolveBaseCost: async () => ({ basePostCost: 25000, tariffVersionId: 'tariff-v1' }),
      calculate: (value, now) => ({ basePostCost: value.base_post_cost, elapsedHours: 0, feePercentage: 0.2, calculatedFee: 3600, isExpired: false }),
      calculateWithActiveTariff: async (value, now) => ({ basePostCost: value.base_post_cost, elapsedHours: 13, actualElapsedHours: 13, feePercentage: 0.4, calculatedFee: 7200, isExpired: false, tariffVersionId: 'tariff-v1', tariffSnapshot: { tariffKey: 'PUDO-N-TARIFF-168H-V1', appliedPercentage: 40 } }) },
    { create: async (value, pricing, transactionManager) => ({ parcel_id: value.id, hub_id: value.current_hub_id, amount: pricing.calculatedFee, snapshot: { percentage: 30 }, manager: transactionManager }) },
  );

  const result = await service.confirmHubReceipt('parcel-1', { sub: 'owner-1', phone: '+18880000001', role: UserRole.HUB_OWNER, is_verified: true }, 'private-object-key-hub-001');
  assert.equal(transactionCalled, true);
  assert.equal(result.parcel.current_hub_id, null);
  assert.equal(result.parcel.delivered_to_hub_at, null);
  assert.equal(result.parcel.status, ParcelStatus.HANDOVER_IN_PROGRESS);
  assert.equal(result.custodyConfirmed, false);
  assert.equal(result.awaitingParty, 'COURIER');
  assert.equal(result.invoice, null);
  assert.equal(result.invoiceDeferredUntilCollectionRequest, false);
});

test('custody is finalized only when courier and hub evidence both exist', async () => {
  const parcel = {
    id: 'parcel-dual-1', recipient_id: 'recipient-1', recipient_phone: dto.recipient_phone,
    proposed_hub_id: 'hub-1', current_hub_id: null, delivered_to_hub_at: null,
    courier_id: 'courier-1', status: ParcelStatus.HANDOVER_IN_PROGRESS,
    hub_receipt_evidence_ref: 'private-object-key-hub-001', hub_receipt_confirmed_at: new Date(),
  };
  const hub = { id: 'hub-1', owner_id: 'owner-1', is_active: true, is_temporarily_closed: false };
  const manager = {
    connection: { options: { type: 'sqlite' } },
    getRepository(entity) {
      if (entity === ParcelEntity) return { findOne: async () => parcel, save: async (value) => value };
      if (entity === HubEntity) return { findOne: async () => hub };
      if (entity === NetworkEntryChargeEntity) return { findOne: async () => ({ status: NetworkEntryChargeStatus.VERIFIED }) };
      if (entity === RevenueAllocationEntity) return { findOne: async () => ({ id: 'already-allocated' }) };
      if (entity === NotificationEntity) return { create: (value) => value, save: async (value) => value };
      if (entity === AuditLogEntity) return { create: (value) => value, save: async (value) => value };
      throw new Error('Unexpected repository');
    },
  };
  const service = new ParcelsService(
    { findOne: async () => parcel }, { findOne: async () => hub }, { findOne: async () => null },
    { transaction: async (work) => work(manager) },
    { resolveBaseCost: async () => ({}), calculate: () => ({}), calculateWithActiveTariff: async () => ({}) },
    { create: async () => ({}) },
  );
  const result = await service.confirmCourierHandover('parcel-dual-1', 'private-object-key-courier-001', {
    sub: 'courier-1', phone: '+989120000099', role: UserRole.COURIER, is_verified: true,
  });
  assert.equal(result.custodyConfirmed, true);
  assert.equal(result.parcel.status, ParcelStatus.STORED_AT_HUB);
  assert.equal(result.parcel.current_hub_id, 'hub-1');
  assert.ok(result.parcel.delivered_to_hub_at instanceof Date);
});

test('only a hub owner can confirm receipt', async () => {
  const { service } = makeService();
  await assert.rejects(
    service.confirmHubReceipt('parcel-1', { sub: 'courier-1', phone: dto.recipient_phone, role: UserRole.COURIER, is_verified: true }, 'private-object-key-hub-001'),
    (error) => error && error.getStatus && error.getStatus() === 403,
  );
});

test('recipient PUDO request selects an active hub and advances the state machine', async () => {
  const parcel = {
    id: 'parcel-request-1', recipient_id: 'recipient-1', recipient_phone: dto.recipient_phone,
    proposed_hub_id: null, current_hub_id: null, delivered_to_hub_at: null,
    base_post_cost: 18000, status: ParcelStatus.DELIVERY_ATTEMPT, courier_id: 'courier-1',
  };
  const hub = { id: 'hub-1', owner_id: 'owner-1', is_active: true, is_temporarily_closed: false };
  const manager = {
    getRepository(entity) {
      if (entity === ParcelEntity) return { findOne: async () => parcel, save: async (value) => value };
      if (entity === HubEntity) return { findOne: async () => hub };
      if (entity === NetworkEntryChargeEntity) return { findOne: async () => ({ status: NetworkEntryChargeStatus.VERIFIED }) };
      if (entity === RevenueAllocationEntity) return { findOne: async () => ({ id: 'already-allocated' }) };
      if (entity === NotificationEntity) return { create: (value) => value, save: async (value) => value };
      if (entity === AuditLogEntity) return { create: (value) => value, save: async (value) => value };
      throw new Error('Unexpected repository');
    },
  };
  const service = new ParcelsService(
    { findOne: async () => parcel },
    { findOne: async () => hub },
    { findOne: async () => ({ id: 'recipient-1' }) },
    { transaction: async (work) => work(manager) },
    { resolveBaseCost: async () => ({ basePostCost: 25000, tariffVersionId: 'tariff-v1' }),
      calculate: () => ({ basePostCost: 18000, elapsedHours: 0, feePercentage: 0.2, calculatedFee: 3600 }),
      calculateWithActiveTariff: async () => ({ basePostCost: 18000, elapsedHours: 13, feePercentage: 0.4, calculatedFee: 7200, isExpired: false, tariffVersionId: 'tariff-v1', tariffSnapshot: { tariffKey: 'PUDO-N-TARIFF-168H-V1', appliedPercentage: 40 } }) },
    { create: async () => ({}) },
  );

  const result = await service.requestPudo('parcel-request-1', 'hub-1', {
    sub: 'recipient-1', phone: dto.recipient_phone, role: UserRole.RECIPIENT, is_verified: true,
  });
  assert.equal(result.proposed_hub_id, 'hub-1');
  assert.equal(result.status, ParcelStatus.HUB_SELECTED);
});

test('non-recipient cannot request PUDO for a parcel', async () => {
  const { service } = makeService();
  await assert.rejects(
    service.requestPudo('parcel-1', 'hub-1', { sub: 'courier-1', phone: dto.recipient_phone, role: UserRole.COURIER, is_verified: true }),
    (error) => error && error.getStatus && error.getStatus() === 403,
  );
});

test('recipient collection request issues invoice using elapsed custody tariff and is idempotent', async () => {
  const deliveredAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
  const parcel = {
    id: 'parcel-collect-1', recipient_id: 'recipient-1', recipient_phone: dto.recipient_phone,
    proposed_hub_id: 'hub-1', current_hub_id: 'hub-1', delivered_to_hub_at: deliveredAt,
    base_post_cost: 18000, status: ParcelStatus.STORED_AT_HUB, courier_id: 'courier-1',
  };
  let invoice = null;
  let pricingCalledAt = null;
  const manager = {
    getRepository(entity) {
      if (entity === ParcelEntity) return { findOne: async () => parcel, save: async (value) => value };
      if (entity === InvoiceEntity) return {
        findOne: async () => invoice,
      };
      if (entity === AuditLogEntity) return { create: (value) => value, save: async (value) => value };
      throw new Error('Unexpected repository');
    },
  };
  const service = new ParcelsService(
    { findOne: async () => parcel },
    { findOne: async () => null },
    { findOne: async () => ({ id: 'recipient-1' }) },
    { transaction: async (work) => work(manager) },
    { calculate: (value, now) => {
      pricingCalledAt = now;
      assert.equal(value.delivered_to_hub_at, deliveredAt);
      return {
        basePostCost: 18000, elapsedHours: 13, actualElapsedHours: 13,
        feePercentage: 0.4, calculatedFee: 7200,
        tariffSnapshot: { tariffKey: 'PUDO-N-TARIFF-168H-V1', appliedPercentage: 40 },
      };
    },
      calculateWithActiveTariff: async (value, now) => {
        pricingCalledAt = now;
        assert.equal(value.delivered_to_hub_at, deliveredAt);
        return {
          basePostCost: 18000, elapsedHours: 13, actualElapsedHours: 13,
          feePercentage: 0.4, calculatedFee: 7200, isExpired: false,
          tariffVersionId: 'tariff-v1',
          tariffSnapshot: { tariffKey: 'PUDO-N-TARIFF-168H-V1', tariffVersionId: 'tariff-v1', appliedPercentage: 40 },
        };
      } },
    { create: async (value, pricing) => {
      invoice = { parcel_id: value.id, hub_id: value.current_hub_id, amount: pricing.calculatedFee, tariff_snapshot: pricing.tariffSnapshot };
      return invoice;
    } },
  );

  const result = await service.requestCustomerCollection('parcel-collect-1', {
    sub: 'recipient-1', phone: dto.recipient_phone, role: UserRole.RECIPIENT, is_verified: true,
  });
  assert.ok(pricingCalledAt instanceof Date);
  assert.equal(result.parcel.status, ParcelStatus.READY_FOR_CUSTOMER);
  assert.equal(result.invoice.amount, 7200);
  assert.equal(result.invoice.hub_id, 'hub-1');
  assert.equal(result.invoice.tariff_snapshot.appliedPercentage, 40);
  assert.equal(result.alreadyIssued, false);

  const retry = await service.requestCustomerCollection('parcel-collect-1', {
    sub: 'recipient-1', phone: dto.recipient_phone, role: UserRole.RECIPIENT, is_verified: true,
  });
  assert.equal(retry.invoice, invoice);
  assert.equal(retry.alreadyIssued, true);
});

test('only the recipient can request customer collection', async () => {
  const { service } = makeService();
  await assert.rejects(
    service.requestCustomerCollection('parcel-1', {
      sub: 'courier-1', phone: dto.recipient_phone, role: UserRole.COURIER, is_verified: true,
    }),
    (error) => error && error.getStatus && error.getStatus() === 403,
  );
});


test('expired storage request records expiry and does not issue an invoice', async () => {
  const parcel = {
    id: 'parcel-expired-1', recipient_id: 'recipient-1', recipient_phone: dto.recipient_phone,
    current_hub_id: 'hub-1', delivered_to_hub_at: new Date(Date.now() - 169 * 60 * 60 * 1000),
    package_size: 'MEDIUM', base_post_cost: 25000, status: ParcelStatus.STORED_AT_HUB,
  };
  const manager = {
    getRepository(entity) {
      if (entity === ParcelEntity) return { findOne: async () => parcel, save: async (value) => value };
      if (entity === InvoiceEntity) return { findOne: async () => null };
      if (entity === AuditLogEntity) return { create: (value) => value, save: async (value) => value };
      throw new Error('Unexpected repository');
    },
  };
  const service = new ParcelsService(
    { findOne: async () => parcel },
    { findOne: async () => null },
    { findOne: async () => ({ id: 'recipient-1' }) },
    { transaction: async (work) => work(manager) },
    {
      resolveBaseCost: async () => ({ basePostCost: 25000, tariffVersionId: 'tariff-v1' }),
      calculate: () => ({}),
      calculateWithActiveTariff: async () => ({ isExpired: true, tariffVersionId: 'tariff-v1' }),
    },
    { create: async () => { throw new Error('Expired parcel must not be invoiced'); } },
  );
  const result = await service.requestCustomerCollection('parcel-expired-1', {
    sub: 'recipient-1', phone: dto.recipient_phone, role: UserRole.RECIPIENT, is_verified: true,
  });
  assert.equal(result.expired, true);
  assert.equal(result.invoice, null);
  assert.equal(result.parcel.status, ParcelStatus.STORED_AT_HUB);
  assert.ok(result.parcel.expired_at instanceof Date);
});

test('hub owner cannot release before payment and can release after invoice is paid', async () => {
  const parcel = {
    id: 'parcel-release-1', current_hub_id: 'hub-1', recipient_id: 'recipient-1',
    status: ParcelStatus.READY_FOR_CUSTOMER, collected_at: null,
  };
  const hub = { id: 'hub-1', owner_id: 'owner-1' };
  const invoice = { id: 'invoice-release-1', parcel_id: parcel.id, status: 'PENDING' };
  const salt = 'a'.repeat(32);
  const transfer = {
    id: 'custody-transfer-1', parcel_id: parcel.id, transfer_type: CustodyTransferType.HUB_TO_RECIPIENT,
    status: CustodyTransferStatus.PENDING, code_salt: salt,
    code_hash: createHash('sha256').update(`${salt}:123456`).digest('hex'),
    expires_at: new Date(Date.now() + 60_000), failed_attempts: 0,
  };
  const manager = {
    getRepository(entity) {
      if (entity === ParcelEntity) return { findOne: async () => parcel, save: async (value) => value };
      if (entity === HubEntity) return { findOne: async () => hub };
      if (entity === InvoiceEntity) return { findOne: async () => invoice };
      if (entity === CustodyTransferEntity) return { findOne: async () => transfer, save: async (value) => value };
      if (entity === AuditLogEntity) return { create: (value) => value, save: async (value) => value };
      if (entity === NotificationEntity) return { create: (value) => value, save: async (value) => value };
      if (entity === require('../dist/database/entities/user.entity').UserEntity) return { findOne: async () => null };
      throw new Error('Unexpected repository');
    },
    connection: { options: { type: 'sqlite' } },
    query: async () => [],
  };
  const service = new ParcelsService(
    { findOne: async () => parcel },
    { findOne: async () => hub },
    { findOne: async () => null },
    { transaction: async (work) => work(manager) },
    { resolveBaseCost: async () => ({ basePostCost: 25000 }), calculate: () => ({}), calculateWithActiveTariff: async () => ({}) },
    { create: async () => ({}) },
  );
  const owner = { sub: 'owner-1', phone: '+18880000001', role: UserRole.HUB_OWNER, is_verified: true };
  await assert.rejects(service.confirmCustomerRelease(parcel.id, owner, '123456', 'private-hub-evidence-001'),
    (error) => error && error.getStatus && error.getStatus() === 409);
  assert.equal(parcel.status, ParcelStatus.READY_FOR_CUSTOMER);

  invoice.status = 'PAID';
  await assert.rejects(service.confirmCustomerRelease(parcel.id, owner, '654321', 'private-hub-evidence-001'),
    (error) => error && error.getStatus && error.getStatus() === 401);
  assert.equal(transfer.failed_attempts, 1);
  const result = await service.confirmCustomerRelease(parcel.id, owner, '123456', 'private-hub-evidence-001');
  assert.equal(result.verified, true);
  assert.equal(result.awaitingRecipientEvidence, true);
  assert.equal(result.parcelId, parcel.id);
  assert.equal(parcel.status, ParcelStatus.READY_FOR_CUSTOMER);
  assert.ok(transfer.code_verified_at instanceof Date);
  assert.equal(transfer.hub_handover_evidence_ref, 'private-hub-evidence-001');
});

test('recipient delivery code is atomically stored in the private in-app inbox with an audit event', async () => {
  const parcel = {
    id: 'parcel-code-1', tracking_code: 'TRACK-CODE-1', recipient_id: 'recipient-1',
    recipient_phone: '+989120000001', current_hub_id: 'hub-1',
    status: ParcelStatus.READY_FOR_CUSTOMER,
  };
  const invoice = { id: 'invoice-code-1', parcel_id: parcel.id, status: 'PAID' };
  const saved = { transfers: [], notifications: [], audits: [] };
  const manager = {
    connection: { options: { type: 'sqlite' } },
    getRepository(entity) {
      if (entity === ParcelEntity) return { findOne: async () => parcel };
      if (entity === CustodyTransferEntity) return {
        findOne: async () => null,
        update: async () => ({ affected: 0 }),
        create: (value) => ({ ...value }),
        save: async (value) => { value.id = 'transfer-code-1'; saved.transfers.push(value); return value; },
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
  const dataSource = {
    getRepository(entity) {
      if (entity === InvoiceEntity) return { findOne: async () => invoice };
      throw new Error('Unexpected data-source repository');
    },
    transaction: async (work) => work(manager),
  };
  const service = new ParcelsService(
    { findOne: async () => parcel }, { findOne: async () => null }, { findOne: async () => null },
    dataSource, {}, {},
  );
  const result = await service.requestDeliveryCode(parcel.id, {
    sub: 'recipient-1', phone: parcel.recipient_phone, role: UserRole.RECIPIENT, is_verified: true,
  });
  assert.equal(result.sent, true);
  assert.equal(result.channel, 'IN_APP');
  assert.equal(saved.transfers.length, 1);
  assert.equal(saved.notifications.length, 1);
  assert.equal(saved.audits.length, 1);
  assert.equal(saved.audits[0].action, 'DELIVERY_CODE_NOTIFIED_IN_APP');
  assert.equal(saved.audits[0].metadata.channel, 'IN_APP');
  const match = saved.notifications[0].body.match(/ برابر (\d{6}) است/);
  assert.ok(match, 'in-app notification should contain a six-digit code');
  const transfer = saved.transfers[0];
  assert.equal(transfer.code_hash, createHash('sha256').update(`${transfer.code_salt}:${match[1]}`).digest('hex'));
  assert.equal(JSON.stringify(saved.audits).includes(match[1]), false, 'audit logs must not contain the plaintext code');
});
