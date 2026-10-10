const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_TYPE = 'sqlite';
process.env.SQLITE_DATABASE = ':memory:';
process.env.SQLITE_SYNCHRONIZE = 'true';
process.env.NODE_ENV = 'test';

const { DataSource } = require('typeorm');
const { createDatabaseOptions } = require('../dist/database/database-options');
const { UserEntity } = require('../dist/database/entities/user.entity');
const { HubEntity } = require('../dist/database/entities/hub.entity');
const { ParcelEntity } = require('../dist/database/entities/parcel.entity');
const { InvoiceEntity, PaymentStatus } = require('../dist/database/entities/invoice.entity');
const { AuditLogEntity } = require('../dist/database/entities/audit-log.entity');
const { SettlementsService } = require('../dist/modules/settlements/settlements.service');
const { UserRole } = require('../dist/common/interfaces/user-payload.interface');

test('SQLite supports verified payment reconciliation and writes its audit record', async () => {
  const dataSource = new DataSource(createDatabaseOptions());
  await dataSource.initialize();
  let admin, recipient, hub, parcel, invoice;
  try {
    admin = await dataSource.getRepository(UserEntity).save(dataSource.getRepository(UserEntity).create({
      phone: '+15550000001', full_name: 'SQLite Admin', role: UserRole.ADMIN,
    }));
    recipient = await dataSource.getRepository(UserEntity).save(dataSource.getRepository(UserEntity).create({
      phone: '+15550000002', full_name: 'SQLite Recipient', role: UserRole.RECIPIENT,
    }));
    hub = await dataSource.getRepository(HubEntity).save(dataSource.getRepository(HubEntity).create({
      owner_id: admin.id, name: 'SQLite Hub', address: 'Test address', city: 'Test city',
      operating_hours: {}, qr_code_hash: 'sqlite-qr-unique',
    }));
    parcel = await dataSource.getRepository(ParcelEntity).save(dataSource.getRepository(ParcelEntity).create({
      tracking_code: 'SQLITE-PAYMENT-001', recipient_phone: recipient.phone, recipient_name: recipient.full_name,
      recipient_address: 'Test address', base_post_cost: 18000, recipient_id: recipient.id,
      proposed_hub_id: hub.id, current_hub_id: hub.id,
    }));
    invoice = await dataSource.getRepository(InvoiceEntity).save(dataSource.getRepository(InvoiceEntity).create({
      invoice_number: 'SQLITE-INV-001', parcel_id: parcel.id, recipient_id: recipient.id, hub_id: hub.id,
      base_post_cost: 18000, elapsed_hours: 1, fee_percentage: 20, calculated_fee: 3600,
      total_amount: 3600, status: PaymentStatus.PENDING, hub_owner_share: 1080, platform_fee: 0,
      tariff_snapshot: { snapshotVersion: 1 }, hub_share_snapshot: { percentage: 30 }, hub_share_percent: 30,
    }));

    const service = new SettlementsService(dataSource);
    const result = await service.recordVerifiedInvoicePayment(
      invoice.id, 'sqlite-provider-ref-001', 'sqlite-idempotency-key-001',
      { sub: admin.id, role: UserRole.ADMIN },
    );
    assert.equal(result.invoiceStatus, PaymentStatus.PAID);
    assert.equal((await dataSource.getRepository(InvoiceEntity).findOneByOrFail({ id: invoice.id })).status, PaymentStatus.PAID);
    assert.equal(await dataSource.getRepository(AuditLogEntity).countBy({
      entity_type: 'invoice', entity_id: invoice.id, action: 'INVOICE_PAYMENT_RECONCILED',
    }), 1);
  } finally {
    if (invoice) await dataSource.getRepository(InvoiceEntity).delete({ id: invoice.id }).catch(() => {});
    if (parcel) await dataSource.getRepository(ParcelEntity).delete({ id: parcel.id }).catch(() => {});
    if (hub) await dataSource.getRepository(HubEntity).delete({ id: hub.id }).catch(() => {});
    for (const user of [recipient, admin]) {
      if (user) await dataSource.getRepository(UserEntity).delete({ id: user.id }).catch(() => {});
    }
    await dataSource.destroy();
  }
});
