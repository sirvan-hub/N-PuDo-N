import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { IdempotencyRecordEntity, IdempotencyState } from '../../database/entities/idempotency-record.entity';
import { InvoiceEntity, PaymentStatus } from '../../database/entities/invoice.entity';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { WalletTransactionEntity, WalletBucket, WalletTransactionType } from '../../database/entities/wallet-transaction.entity';
import { RevenueAllocationEntity, RevenueBeneficiaryType } from '../../database/entities/revenue-allocation.entity';
import { SettlementTransactionEntity, SettlementTransactionStatus, SettlementTransactionType } from '../../database/entities/settlement-transaction.entity';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';

@Injectable()
export class SettlementsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Records a payment already verified by the payment provider or by an authorized reconciliation process.
   * This method does not contact a payment provider and must not be used as proof that a provider payment occurred.
   */
  private async creditRevenueShare(
    manager: any,
    userId: string,
    amount: number,
    invoiceId: string,
    actorId: string,
    beneficiaryType: RevenueBeneficiaryType,
  ) {
    const operationType = `revenue.allocate.${beneficiaryType.toLowerCase()}`;
    const actorScope = `revenue:invoice:${invoiceId}`;
    const idempotencyKey = `invoice:${invoiceId}:${beneficiaryType.toLowerCase()}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ invoiceId, userId, amount, operationType }))
      .digest('hex');
    const idemRepo = manager.getRepository(IdempotencyRecordEntity);
    await idemRepo.createQueryBuilder().insert().values({
      actor_scope: actorScope,
      operation_type: operationType,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      state: IdempotencyState.IN_PROGRESS,
    }).orIgnore().execute();
    const allocationIdem = await idemRepo.findOne({
      where: { actor_scope: actorScope, operation_type: operationType, idempotency_key: idempotencyKey },
    });
    if (!allocationIdem || allocationIdem.request_hash !== requestHash) {
      throw new ConflictException('Unable to establish revenue allocation idempotency record');
    }
    if (allocationIdem.state === IdempotencyState.COMPLETED) return;

    const walletRepo = manager.getRepository(WalletEntity);
    await walletRepo.createQueryBuilder().insert().values({ user_id: userId }).orIgnore().execute();
    const postgres = manager.connection.options.type === 'postgres';
    const wallet = await walletRepo.findOne({
      where: { user_id: userId },
      ...(postgres ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!wallet) throw new ConflictException('Unable to load wallet for revenue allocation');
    const nextBalance = Number(wallet.balance) + amount;
    const nextTotalEarned = Number(wallet.total_earned) + amount;
    if (!Number.isSafeInteger(nextBalance) || !Number.isSafeInteger(nextTotalEarned) ||
        nextBalance > 2_147_483_647 || nextTotalEarned > 2_147_483_647) {
      throw new ConflictException('Revenue allocation exceeds wallet balance limits');
    }
    wallet.balance = nextBalance;
    wallet.total_earned = nextTotalEarned;
    await walletRepo.save(wallet);

    await manager.getRepository(WalletTransactionEntity).save(
      manager.getRepository(WalletTransactionEntity).create({
        wallet_id: wallet.id,
        actor_id: actorId,
        idempotency_record_id: allocationIdem.id,
        transaction_type: WalletTransactionType.EARNING_CREDIT,
        bucket: WalletBucket.AVAILABLE,
        amount: String(amount),
        bucket_balance_after: String(nextBalance),
        currency_unit: 'TOMAN',
        reference_type: 'invoice',
        reference_id: invoiceId,
        description: `Pudo-N ${beneficiaryType.toLowerCase()} share for paid invoice`,
      }),
    );
    allocationIdem.state = IdempotencyState.COMPLETED;
    allocationIdem.response_status = 200;
    allocationIdem.response_body = { invoiceId, userId, amount, balance: nextBalance };
    allocationIdem.completed_at = new Date();
    await idemRepo.save(allocationIdem);
  }

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
      throw new ForbiddenException('Only an administrator can reconcile provider-confirmed invoice payments');
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
      const allocationSnapshot = invoice.revenue_allocation_snapshot as any;
      let revenueAllocationStatus = 'LEGACY_REQUIRES_RECONCILIATION';
      if (allocationSnapshot?.allocationStatus === 'SNAPSHOTTED_PENDING_PAYMENT') {
        const courierShare = Number(invoice.courier_share);
        const hubShare = Number(invoice.hub_owner_share);
        const platformShare = Number(invoice.platform_fee);
        if (![courierShare, hubShare, platformShare].every((amount) => Number.isSafeInteger(amount) && amount >= 0) ||
            courierShare + hubShare + platformShare !== Number(invoice.total_amount)) {
          throw new ConflictException('Invoice revenue allocation snapshot is invalid or does not balance');
        }
        if (!parcel.courier_id) throw new ConflictException('Parcel has no assigned courier for revenue allocation');
        const hub = await manager.getRepository(HubEntity).findOne({ where: { id: invoice.hub_id } });
        if (!hub?.owner_id) throw new ConflictException('Invoice hub has no owner for revenue allocation');

        const split = [
          { type: RevenueBeneficiaryType.COURIER, userId: parcel.courier_id, percent: 30, amount: courierShare },
          { type: RevenueBeneficiaryType.HUB, userId: hub.owner_id, percent: 30, amount: hubShare },
          { type: RevenueBeneficiaryType.PLATFORM, userId: null, percent: 40, amount: platformShare },
        ];
        const allocations = manager.getRepository(RevenueAllocationEntity);
        for (const item of split) {
          await allocations.save(allocations.create({
            charge_type: 'STORAGE_COLLECTION',
            charge_id: invoice.id,
            parcel_id: parcel.id,
            beneficiary_type: item.type,
            beneficiary_id: item.userId,
            percentage: item.percent,
            amount: String(item.amount),
            currency_unit: 'TOMAN',
            allocation_snapshot: allocationSnapshot,
          }));
          if (item.userId && item.amount > 0) {
            await this.creditRevenueShare(manager, item.userId, item.amount, invoice.id, actor.sub, item.type);
          }
        }
        revenueAllocationStatus = 'ALLOCATED_30_30_40';
      }

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

      const postgres = manager.connection.options.type === 'postgres';
      const auditPlaceholders = postgres
        ? '$1, $2, $3, \'invoice\', $4, \'INVOICE_PAYMENT_RECONCILED\', $5, $6, $7, $8, $9'
        : '?, ?, ?, \'invoice\', ?, \'INVOICE_PAYMENT_RECONCILED\', ?, ?, ?, ?, ?';
      await manager.query(
        `INSERT INTO audit_logs (id, actor_id, actor_role, entity_type, entity_id, action, old_state, new_state, transaction_id, correlation_id, metadata)
         VALUES (${auditPlaceholders})`,
        [
          randomUUID(), actor.sub, actor.role, invoice.id,
          JSON.stringify({ status: PaymentStatus.PENDING }),
          JSON.stringify({ status: PaymentStatus.PAID, paidAt: now.toISOString(), amount: invoice.total_amount, revenueAllocationStatus }),
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
