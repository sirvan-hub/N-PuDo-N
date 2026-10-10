const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { DataSource } = require('typeorm');
const { createDatabaseOptions } = require('../dist/database/database-options');
const { ParcelEntity } = require('../dist/database/entities/parcel.entity');
const { CustodyTransferEntity, CustodyTransferStatus, CustodyTransferType } = require('../dist/database/entities/custody-transfer.entity');
const { HubEntity } = require('../dist/database/entities/hub.entity');
const { UserEntity } = require('../dist/database/entities/user.entity');
const { InvoiceEntity, PaymentStatus } = require('../dist/database/entities/invoice.entity');
const { SettlementTransactionEntity, SettlementTransactionType } = require('../dist/database/entities/settlement-transaction.entity');
const { IdempotencyRecordEntity } = require('../dist/database/entities/idempotency-record.entity');
const { ParcelsService } = require('../dist/modules/parcels/parcels.service');
const { SettlementsService } = require('../dist/modules/settlements/settlements.service');
const { ParcelStatus } = require('../dist/modules/parcels/parcel-state-machine');
const { UserRole } = require('../dist/common/interfaces/user-payload.interface');

test('PostgreSQL serializes concurrent payment reconciliation and parcel release', async (t) => {
  if ((process.env.DB_TYPE || '').toLowerCase() !== 'postgres') {
    t.skip('Set DB_TYPE=postgres to run PostgreSQL concurrency integration test');
    return;
  }

  const dataSource = new DataSource(createDatabaseOptions());
  await dataSource.initialize();
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  let owner, recipient, admin, hub, parcel, invoice;

  try {
    owner = await dataSource.getRepository(UserEntity).save(dataSource.getRepository(UserEntity).create({
      phone: `+1998${suffix.slice(0, 10)}`, full_name: 'Concurrency Hub Owner', role: UserRole.HUB_OWNER,
    }));
    recipient = await dataSource.getRepository(UserEntity).save(dataSource.getRepository(UserEntity).create({
      phone: `+1997${suffix.slice(0, 10)}`, full_name: 'Concurrency Recipient', role: UserRole.RECIPIENT,
    }));
    admin = await dataSource.getRepository(UserEntity).save(dataSource.getRepository(UserEntity).create({
      phone: `+1996${suffix.slice(0, 10)}`, full_name: 'Concurrency Admin', role: UserRole.ADMIN,
    }));
    hub = await dataSource.getRepository(HubEntity).save(dataSource.getRepository(HubEntity).create({
      owner_id: owner.id, name: `Concurrency Hub ${suffix}`, address: 'CI address', city: 'CI',
      operating_hours: {}, qr_code_hash: `qr-${suffix}`,
    }));
    parcel = await dataSource.getRepository(ParcelEntity).save(dataSource.getRepository(ParcelEntity).create({
      tracking_code: `CC-${suffix}`, recipient_phone: recipient.phone, recipient_name: recipient.full_name,
      recipient_address: 'CI address', package_size: 'SMALL', base_post_cost: 18000,
      recipient_id: recipient.id, proposed_hub_id: hub.id, current_hub_id: hub.id,
      status: ParcelStatus.READY_FOR_CUSTOMER, delivered_to_hub_at: new Date(),
    }));
    invoice = await dataSource.getRepository(InvoiceEntity).save(dataSource.getRepository(InvoiceEntity).create({
      invoice_number: `INV-CC-${suffix}`, parcel_id: parcel.id, recipient_id: recipient.id, hub_id: hub.id,
      base_post_cost: 18000, elapsed_hours: 1, fee_percentage: 20, calculated_fee: 3600,
      total_amount: 3600, status: PaymentStatus.PENDING, hub_owner_share: 1080, platform_fee: 0,
      hub_share_percent: 30, tariff_snapshot: { snapshotVersion: 1 }, tariff_version_id: null,
      hub_share_snapshot: { percentage: 30 },
    }));

    const codeSalt = 'a'.repeat(32);
    let custodyTransfer = await dataSource.getRepository(CustodyTransferEntity).save(
      dataSource.getRepository(CustodyTransferEntity).create({
        parcel_id: parcel.id,
        from_hub_id: hub.id,
        receiver_id: recipient.id,
        transfer_type: CustodyTransferType.HUB_TO_RECIPIENT,
        status: CustodyTransferStatus.PENDING,
        code_salt: codeSalt,
        code_hash: createHash('sha256').update(`${codeSalt}:482916`).digest('hex'),
        expires_at: new Date(Date.now() + 5 * 60_000),
        failed_attempts: 0,
      }),
    );

    const settlementService = new SettlementsService(dataSource);
    const paymentResults = await Promise.allSettled([
      settlementService.recordVerifiedInvoicePayment(invoice.id, `provider-${suffix}`, `idem-a-${suffix}`, { sub: admin.id, role: UserRole.ADMIN }),
      settlementService.recordVerifiedInvoicePayment(invoice.id, `provider-${suffix}`, `idem-b-${suffix}`, { sub: admin.id, role: UserRole.ADMIN }),
    ]);
    assert.equal(paymentResults.filter((result) => result.status === 'fulfilled').length, 1,
      'exactly one concurrent payment reconciliation must succeed');
    assert.equal(paymentResults.filter((result) => result.status === 'rejected').length, 1,
      'the duplicate concurrent payment must be rejected');
    assert.equal(await dataSource.getRepository(InvoiceEntity).countBy({ id: invoice.id, status: PaymentStatus.PAID }), 1);
    assert.equal(await dataSource.getRepository(SettlementTransactionEntity).countBy({
      invoice_id: invoice.id, transaction_type: SettlementTransactionType.PAYMENT,
    }), 1);

    const payment = await dataSource.getRepository(InvoiceEntity).findOneByOrFail({ id: invoice.id });
    assert.equal(payment.status, PaymentStatus.PAID);

    const parcelService = new ParcelsService(
      dataSource.getRepository(ParcelEntity),
      dataSource.getRepository(HubEntity),
      dataSource.getRepository(UserEntity),
      dataSource,
      { resolveBaseCost: async () => ({ basePostCost: 18000, tariffVersionId: null }), calculateWithActiveTariff: async () => ({}) },
      { create: async () => ({}) },
    );
    const ownerActor = { sub: owner.id, phone: owner.phone, role: UserRole.HUB_OWNER };
    const releaseResults = await Promise.allSettled([
      parcelService.confirmCustomerRelease(parcel.id, ownerActor, '482916'),
      parcelService.confirmCustomerRelease(parcel.id, ownerActor, '482916'),
    ]);
    assert.equal(releaseResults.filter((result) => result.status === 'fulfilled').length, 2,
      'release retries should return a successful idempotent result');
    const releases = releaseResults.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    assert.equal(releases.filter((result) => result.alreadyReleased === false).length, 1,
      'exactly one request must perform the physical release transition');
    assert.equal(releases.filter((result) => result.alreadyReleased === true).length, 1,
      'the racing retry must observe the already-released parcel');
    assert.equal(await dataSource.getRepository(ParcelEntity).countBy({ id: parcel.id, status: ParcelStatus.COLLECTED }), 1);
  } finally {
    if (invoice) {
      await dataSource.getRepository(SettlementTransactionEntity).delete({ invoice_id: invoice.id }).catch(() => {});
      await dataSource.getRepository(InvoiceEntity).delete({ id: invoice.id }).catch(() => {});
    }
    if (parcel) {
      await dataSource.getRepository(CustodyTransferEntity).delete({ parcel_id: parcel.id }).catch(() => {});
      await dataSource.getRepository(ParcelEntity).delete({ id: parcel.id }).catch(() => {});
    }
    if (hub) await dataSource.getRepository(HubEntity).delete({ id: hub.id }).catch(() => {});
    for (const user of [owner, recipient, admin]) {
      if (user) await dataSource.getRepository(UserEntity).delete({ id: user.id }).catch(() => {});
    }
    await dataSource.getRepository(IdempotencyRecordEntity).delete([
      { idempotency_key: `idem-a-${suffix}` }, { idempotency_key: `idem-b-${suffix}` },
    ]).catch(() => {});
    await dataSource.destroy();
  }
});
