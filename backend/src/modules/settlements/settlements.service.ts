import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { IdempotencyRecordEntity, IdempotencyState } from '../../database/entities/idempotency-record.entity';
import { InvoiceEntity, PaymentStatus } from '../../database/entities/invoice.entity';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { SettlementTransactionEntity, SettlementTransactionStatus, SettlementTransactionType } from '../../database/entities/settlement-transaction.entity';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';

@Injectable()
export class SettlementsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Records a payment already verified by the payment provider or by an authorized reconciliation process.
   * This method does not contact a payment provider and must not be used as proof that a provider payment occurred.
   */
  async recordVerifiedInvoicePayment(
    invoiceId: string,
    providerReference: string,
    idempotencyKey: string,
    actor: UserPayload,
  ) {
    if (!invoiceId) throw new BadRequestException('invoiceId is required');
    if (!providerReference || providerReference.trim().length === 0 || providerReference.length > 160) {
      throw new BadRequestException('A verified provider reference of at most 160 characters is required');
    }
    if (!idempotencyKey || idempotencyKey.trim().length === 0 || idempotencyKey.length > 255) {
      throw new BadRequestException('A valid Idempotency-Key of at most 255 characters is required');
    }
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
      throw new ConflictException('Only an administrator can reconcile provider-confirmed invoice payments');
    }

    const operationType = 'settlement.invoice-payment';
    const actorScope = `user:${actor.sub}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ invoiceId, providerReference: providerReference.trim(), operationType }))
      .digest('hex');

    return this.dataSource.transaction(async (manager) => {
      const idempotencyRepo = manager.getRepository(IdempotencyRecordEntity);
      const invoiceRepo = manager.getRepository(InvoiceEntity);
      const settlementRepo = manager.getRepository(SettlementTransactionEntity);

      await idempotencyRepo.createQueryBuilder().insert().values({
        actor_scope: actorScope,
        operation_type: operationType,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        state: IdempotencyState.IN_PROGRESS,
      }).orIgnore().execute();

      const idem = await idempotencyRepo.findOne({
        where: { actor_scope: actorScope, operation_type: operationType, idempotency_key: idempotencyKey },
      });
      if (!idem) throw new ConflictException('Unable to establish idempotency record');
      if (idem.request_hash !== requestHash) {
        throw new ConflictException('Idempotency-Key was already used with a different request');
      }
      if (idem.state === IdempotencyState.COMPLETED) return idem.response_body;

      const invoiceQuery = invoiceRepo.createQueryBuilder('invoice').where('invoice.id = :invoiceId', { invoiceId });
      if (manager.connection.options.type === 'postgres') invoiceQuery.setLock('pessimistic_write');
      const invoice = await invoiceQuery.getOne();
      if (!invoice) throw new NotFoundException('Invoice not found');

      if (invoice.status !== PaymentStatus.PENDING) {
        throw new ConflictException(`Only PENDING invoices can be marked paid; current status is ${invoice.status}`);
      }

      const parcel = await manager.getRepository(ParcelEntity).findOne({ where: { id: invoice.parcel_id } });
      if (!parcel) throw new NotFoundException('Linked parcel not found');

      const duplicateReference = await settlementRepo.findOne({
        where: { transaction_type: SettlementTransactionType.PAYMENT, provider_reference: providerReference.trim() },
      });
      if (duplicateReference) throw new ConflictException('Provider reference has already been recorded');

      const now = new Date();
      invoice.status = PaymentStatus.PAID;
      invoice.paid_at = now;
      await invoiceRepo.save(invoice);

      const settlement = await settlementRepo.save(settlementRepo.create({
        parcel_id: parcel.id,
        invoice_id: invoice.id,
        actor_id: actor.sub,
        transaction_type: SettlementTransactionType.PAYMENT,
        status: SettlementTransactionStatus.COMPLETED,
        amount: String(invoice.total_amount),
        currency_unit: 'TOMAN',
        idempotency_record_id: idem.id,
        provider_reference: providerReference.trim(),
        completed_at: now,
      }));

      await manager.query(
        `INSERT INTO audit_logs (actor_id, actor_role, entity_type, entity_id, action, old_state, new_state, transaction_id, correlation_id, metadata)
         VALUES ($1, $2, 'invoice', $3, 'INVOICE_PAYMENT_RECONCILED', $4, $5, $6, $7, $8)`,
        [
          actor.sub, actor.role, invoice.id,
          JSON.stringify({ status: PaymentStatus.PENDING }),
          JSON.stringify({ status: PaymentStatus.PAID, paidAt: now.toISOString(), amount: invoice.total_amount }),
          settlement.id, idempotencyKey,
          JSON.stringify({ providerReference: providerReference.trim(), parcelId: parcel.id }),
        ],
      );

      const result = {
        settlementId: settlement.id,
        invoiceId: invoice.id,
        parcelId: parcel.id,
        status: SettlementTransactionStatus.COMPLETED,
        invoiceStatus: PaymentStatus.PAID,
        amount: Number(invoice.total_amount),
        currencyUnit: 'TOMAN',
        providerReference: providerReference.trim(),
        paidAt: now.toISOString(),
      };
      idem.state = IdempotencyState.COMPLETED;
      idem.response_status = 200;
      idem.response_body = result;
      idem.completed_at = now;
      await idempotencyRepo.save(idem);
      return result;
    });
  }
}
