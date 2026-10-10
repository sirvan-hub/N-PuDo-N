import { BadRequestException, ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { IdempotencyRecordEntity, IdempotencyState } from '../../database/entities/idempotency-record.entity';
import { WalletTransactionEntity, WalletBucket, WalletTransactionType } from '../../database/entities/wallet-transaction.entity';
import { WalletEntity } from '../../database/entities/wallet.entity';

type CreditResult = {
  walletId: string;
  userId: string;
  amount: number;
  balance: number;
  pendingBalance: number;
  blockedBalance: number;
  totalEarned: number;
  ledgerTransactionId: string;
};

@Injectable()
export class WalletsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getOrCreate(userId: string): Promise<WalletEntity> {
    const wallets = this.dataSource.getRepository(WalletEntity);
    let wallet = await wallets.findOne({ where: { user_id: userId } });
    if (wallet) return wallet;

    try {
      wallet = wallets.create({ user_id: userId });
      return await wallets.save(wallet);
    } catch (error) {
      // Concurrent first access may race on the unique user_id. Re-read the winner.
      const winner = await wallets.findOne({ where: { user_id: userId } });
      if (winner) return winner;
      throw error;
    }
  }

  /**
   * Credits an available wallet balance and appends its ledger entry atomically.
   * A caller must supply a stable Idempotency-Key for retries.
   */
  async credit(userId: string, amount: number, idempotencyKey: string): Promise<CreditResult> {
    if (!userId) throw new BadRequestException('userId is required');
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
      throw new BadRequestException('amount must be a positive integer within the supported wallet range');
    }
    if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0 || idempotencyKey.length > 255) {
      throw new BadRequestException('A valid Idempotency-Key of at most 255 characters is required');
    }

    await this.getOrCreate(userId);

    const operationType = 'wallet.credit';
    const actorScope = `user:${userId}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ userId, amount, operationType }))
      .digest('hex');

    return this.dataSource.transaction(async (manager) => {
      const idempotencyRepo = manager.getRepository(IdempotencyRecordEntity);
      const walletRepo = manager.getRepository(WalletEntity);
      const ledgerRepo = manager.getRepository(WalletTransactionEntity);

      // ON CONFLICT DO NOTHING (Postgres) / INSERT OR IGNORE (SQLite) ensures
      // concurrent requests with the same scoped key converge on one record.
      await idempotencyRepo
        .createQueryBuilder()
        .insert()
        .values({
          actor_scope: actorScope,
          operation_type: operationType,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          state: IdempotencyState.IN_PROGRESS,
        })
        .orIgnore()
        .execute();

      const idempotency = await idempotencyRepo.findOne({
        where: { actor_scope: actorScope, operation_type: operationType, idempotency_key: idempotencyKey },
      });
      if (!idempotency) throw new InternalServerErrorException('Unable to establish idempotency record');
      if (idempotency.request_hash !== requestHash) {
        throw new ConflictException('Idempotency-Key was already used with a different request');
      }
      if (idempotency.state === IdempotencyState.COMPLETED) {
        return idempotency.response_body as unknown as CreditResult;
      }

      const wallet = await this.findWalletForUpdate(manager, userId);
      if (!wallet) throw new InternalServerErrorException('Wallet disappeared during credit operation');

      const nextBalance = wallet.balance + amount;
      const nextTotalEarned = wallet.total_earned + amount;
      if (!Number.isSafeInteger(nextBalance) || nextBalance > 2_147_483_647 ||
          !Number.isSafeInteger(nextTotalEarned) || nextTotalEarned > 2_147_483_647) {
        throw new BadRequestException('Wallet balance exceeds the supported range');
      }

      wallet.balance = nextBalance;
      wallet.total_earned = nextTotalEarned;
      await walletRepo.save(wallet);

      const ledger = await ledgerRepo.save(ledgerRepo.create({
        wallet_id: wallet.id,
        actor_id: userId,
        idempotency_record_id: idempotency.id,
        transaction_type: WalletTransactionType.EARNING_CREDIT,
        bucket: WalletBucket.AVAILABLE,
        amount: String(amount),
        bucket_balance_after: String(nextBalance),
        currency_unit: 'TOMAN',
        description: 'Idempotent wallet credit',
      }));

      const result: CreditResult = {
        walletId: wallet.id,
        userId,
        amount,
        balance: wallet.balance,
        pendingBalance: wallet.pending_balance,
        blockedBalance: wallet.blocked_balance ?? 0,
        totalEarned: wallet.total_earned,
        ledgerTransactionId: ledger.id,
      };
      idempotency.state = IdempotencyState.COMPLETED;
      idempotency.response_status = 200;
      idempotency.response_body = result as unknown as Record<string, unknown>;
      idempotency.completed_at = new Date();
      await idempotencyRepo.save(idempotency);
      return result;
    });
  }

  private async findWalletForUpdate(manager: EntityManager, userId: string): Promise<WalletEntity | null> {
    const repository = manager.getRepository(WalletEntity);
    if (manager.connection.options.type === 'postgres') {
      return repository.findOne({ where: { user_id: userId }, lock: { mode: 'pessimistic_write' } });
    }
    // SQLite serializes writes at the database level; no unsupported row lock requested.
    return repository.findOne({ where: { user_id: userId } });
  }
}
