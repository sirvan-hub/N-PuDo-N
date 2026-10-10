import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { PayoutPreferenceEntity } from '../../database/entities/payout-preference.entity';
import { WalletTransactionEntity, WalletBucket, WalletTransactionType } from '../../database/entities/wallet-transaction.entity';
import { IdempotencyRecordEntity, IdempotencyState } from '../../database/entities/idempotency-record.entity';
import { SettlementTransactionEntity, SettlementTransactionStatus, SettlementTransactionType } from '../../database/entities/settlement-transaction.entity';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';

@Injectable()
export class CourierPayoutRequestsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async requestPayout(amount: number, key: string, actor: UserPayload) {
    if (actor.role !== UserRole.COURIER) throw new ForbiddenException('Only an assigned courier can request a payout');
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
      throw new BadRequestException('amount must be a positive whole-toman amount within the wallet limit');
    }
    this.validateKey(key);
    const operation = 'settlement.courier-payout-request';
    const hash = this.hash({ courierId: actor.sub, amount, operation });
    return this.dataSource.transaction(async (manager) => {
      const preference = await manager.getRepository(PayoutPreferenceEntity).findOne({ where: { user_id: actor.sub } });
      if (!preference?.destination_token || !preference.destination_verified_at) {
        throw new ConflictException('A payout destination must be configured and manually verified before requesting settlement');
      }
      const idem = await this.getIdempotency(manager, actor.sub, operation, key, hash);
      if (idem.state === IdempotencyState.COMPLETED) return idem.response_body;

      const wallet = await this.lockWallet(manager, actor.sub);
      if (!wallet || wallet.balance < amount) throw new BadRequestException('Insufficient available wallet balance');
      const existing = await manager.getRepository(SettlementTransactionEntity).createQueryBuilder('s')
        .where('s.requested_by = :courierId', { courierId: actor.sub })
        .andWhere('s.transaction_type = :type', { type: SettlementTransactionType.COURIER_PAYOUT })
        .andWhere('s.status IN (:...statuses)', { statuses: [SettlementTransactionStatus.REQUESTED, SettlementTransactionStatus.APPROVED] })
        .getOne();
      if (existing) throw new ConflictException('This courier already has an open payout request');

      wallet.balance -= amount;
      wallet.blocked_balance = Number(wallet.blocked_balance ?? 0) + amount;
      if (wallet.blocked_balance > 2_147_483_647) throw new BadRequestException('Blocked wallet balance exceeds supported range');
      await manager.getRepository(WalletEntity).save(wallet);
      const ledger = manager.getRepository(WalletTransactionEntity);
      await ledger.save(ledger.create({
        wallet_id: wallet.id, actor_id: actor.sub, idempotency_record_id: idem.id,
        transaction_type: WalletTransactionType.HOLD, bucket: WalletBucket.AVAILABLE,
        amount: String(amount), bucket_balance_after: String(wallet.balance), currency_unit: 'TOMAN',
        reference_type: 'SETTLEMENT', description: 'Reserve funds for courier payout request',
      }));
      await ledger.save(ledger.create({
        wallet_id: wallet.id, actor_id: actor.sub, idempotency_record_id: idem.id,
        transaction_type: WalletTransactionType.HOLD, bucket: WalletBucket.BLOCKED,
        amount: String(amount), bucket_balance_after: String(wallet.blocked_balance), currency_unit: 'TOMAN',
        reference_type: 'SETTLEMENT', description: 'Reserve funds for hub payout request',
      }));

      const request = await manager.getRepository(SettlementTransactionEntity).save(
        manager.getRepository(SettlementTransactionEntity).create({
          wallet_id: wallet.id, actor_id: actor.sub, requested_by: actor.sub,
          transaction_type: SettlementTransactionType.COURIER_PAYOUT,
          status: SettlementTransactionStatus.REQUESTED, amount: String(amount), currency_unit: 'TOMAN',
          idempotency_record_id: idem.id,
        }),
      );
      const response = {
        requestId: request.id, courierId: actor.sub, amount, frequency: preference.frequency, currencyUnit: 'TOMAN',
        status: SettlementTransactionStatus.REQUESTED, availableBalance: wallet.balance,
        blockedBalance: wallet.blocked_balance,
        note: 'Funds are reserved. Approval does not execute a bank or payment-provider transfer.',
      };
      idem.state = IdempotencyState.COMPLETED;
      idem.response_status = 201;
      idem.response_body = response;
      idem.completed_at = new Date();
      await manager.getRepository(IdempotencyRecordEntity).save(idem);
      return response;
    });
  }

  async listForCourier(actor: UserPayload) {
    if (actor.role !== UserRole.COURIER) throw new ForbiddenException('Only a courier can read their payout history');
    const rows = await this.dataSource.getRepository(SettlementTransactionEntity).find({
      where: { requested_by: actor.sub, transaction_type: SettlementTransactionType.COURIER_PAYOUT },
      order: { created_at: 'DESC', id: 'DESC' },
    });
    return rows.map((row) => ({
      requestId: row.id, courierId: actor.sub, amount: Number(row.amount), currencyUnit: row.currency_unit,
      status: row.status, requestedBy: row.requested_by, reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at, reviewNote: row.review_note, createdAt: row.created_at,
      transferReference: row.status === SettlementTransactionStatus.COMPLETED ? row.provider_reference : null,
    }));
  }

  private validateKey(key: string) {
    if (typeof key !== 'string' || key.trim().length === 0 || key.length > 255) {
      throw new BadRequestException('A valid Idempotency-Key of at most 255 characters is required');
    }
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async getIdempotency(manager: EntityManager, actorId: string, operation: string, key: string, hash: string) {
    const repository = manager.getRepository(IdempotencyRecordEntity);
    const actorScope = 'user:' + actorId;
    await repository.createQueryBuilder().insert().values({
      actor_scope: actorScope, operation_type: operation, idempotency_key: key,
      request_hash: hash, state: IdempotencyState.IN_PROGRESS,
    }).orIgnore().execute();
    const idem = await repository.findOne({ where: { actor_scope: actorScope, operation_type: operation, idempotency_key: key } });
    if (!idem) throw new ConflictException('Unable to establish idempotency record');
    if (idem.request_hash !== hash) throw new ConflictException('Idempotency-Key was already used with a different request');
    return idem;
  }

  private async lockWallet(manager: EntityManager, userId: string) {
    const repo = manager.getRepository(WalletEntity);
    const query = repo.createQueryBuilder('wallet').where('wallet.user_id = :userId', { userId });
    if (manager.connection.options.type === 'postgres') query.setLock('pessimistic_write');
    return query.getOne();
  }

  private async lockWalletById(manager: EntityManager, walletId: string) {
    const repo = manager.getRepository(WalletEntity);
    const query = repo.createQueryBuilder('wallet').where('wallet.id = :walletId', { walletId });
    if (manager.connection.options.type === 'postgres') query.setLock('pessimistic_write');
    return query.getOne();
  }
}
