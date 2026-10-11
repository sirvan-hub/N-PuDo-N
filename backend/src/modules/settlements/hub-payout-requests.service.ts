import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { HubEntity } from '../../database/entities/hub.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { PayoutPreferenceEntity } from '../../database/entities/payout-preference.entity';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { WalletTransactionEntity, WalletBucket, WalletTransactionType } from '../../database/entities/wallet-transaction.entity';
import { IdempotencyRecordEntity, IdempotencyState } from '../../database/entities/idempotency-record.entity';
import { SettlementTransactionEntity, SettlementTransactionStatus, SettlementTransactionType } from '../../database/entities/settlement-transaction.entity';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';

@Injectable()
export class HubPayoutRequestsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async requestPayout(hubId: string, amount: number, key: string, actor: UserPayload) {
    if (actor.role !== UserRole.HUB_OWNER) throw new ForbiddenException('Only a hub owner can request a payout');
    if (!hubId) throw new BadRequestException('hubId is required');
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
      throw new BadRequestException('amount must be a positive whole-toman amount within the wallet limit');
    }
    this.validateKey(key);
    const operation = 'settlement.hub-payout-request';
    const hash = this.hash({ hubId, amount, operation });
    return this.dataSource.transaction(async (manager) => {
      const hub = await manager.getRepository(HubEntity).findOne({ where: { id: hubId, owner_id: actor.sub } });
      if (!hub) throw new NotFoundException('Hub not found for the authenticated owner');
      const preference = await manager.getRepository(PayoutPreferenceEntity).findOne({ where: { user_id: actor.sub } });
      if (!preference?.destination_token || !preference.destination_verified_at) {
        throw new ConflictException('A payout destination must be configured and manually verified before requesting settlement');
      }
      const idem = await this.getIdempotency(manager, actor.sub, operation, key, hash);
      if (idem.state === IdempotencyState.COMPLETED) return idem.response_body;

      const wallet = await this.lockWallet(manager, actor.sub);
      if (!wallet || wallet.balance < amount) throw new BadRequestException('Insufficient available wallet balance');
      const existing = await manager.getRepository(SettlementTransactionEntity).createQueryBuilder('s')
        .where('s.hub_id = :hubId', { hubId })
        .andWhere('s.transaction_type = :type', { type: SettlementTransactionType.HUB_PAYOUT })
        .andWhere('s.status IN (:...statuses)', { statuses: [SettlementTransactionStatus.REQUESTED, SettlementTransactionStatus.APPROVED] })
        .getOne();
      if (existing) throw new ConflictException('This hub already has an open payout request');

      wallet.balance -= amount;
      wallet.blocked_balance = Number(wallet.blocked_balance ?? 0) + amount;
      if (wallet.blocked_balance > 2_147_483_647) throw new BadRequestException('Blocked wallet balance exceeds supported range');
      await manager.getRepository(WalletEntity).save(wallet);
      const ledger = manager.getRepository(WalletTransactionEntity);
      await ledger.save(ledger.create({
        wallet_id: wallet.id, actor_id: actor.sub, idempotency_record_id: idem.id,
        transaction_type: WalletTransactionType.HOLD, bucket: WalletBucket.AVAILABLE,
        amount: String(amount), bucket_balance_after: String(wallet.balance), currency_unit: 'TOMAN',
        reference_type: 'SETTLEMENT', description: 'Reserve funds for hub payout request',
      }));
      await ledger.save(ledger.create({
        wallet_id: wallet.id, actor_id: actor.sub, idempotency_record_id: idem.id,
        transaction_type: WalletTransactionType.HOLD, bucket: WalletBucket.BLOCKED,
        amount: String(amount), bucket_balance_after: String(wallet.blocked_balance), currency_unit: 'TOMAN',
        reference_type: 'SETTLEMENT', description: 'Reserve funds for hub payout request',
      }));

      const request = await manager.getRepository(SettlementTransactionEntity).save(
        manager.getRepository(SettlementTransactionEntity).create({
          hub_id: hub.id, wallet_id: wallet.id, actor_id: actor.sub, requested_by: actor.sub,
          transaction_type: SettlementTransactionType.HUB_PAYOUT,
          status: SettlementTransactionStatus.REQUESTED, amount: String(amount), currency_unit: 'TOMAN',
          idempotency_record_id: idem.id,
        }),
      );
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub, actor_role: actor.role, entity_type: 'settlement_transaction', entity_id: request.id,
        action: 'PAYOUT_REQUESTED', old_state: { availableBalance: wallet.balance + amount, blockedBalance: Number(wallet.blocked_balance) - amount },
        new_state: { status: SettlementTransactionStatus.REQUESTED, availableBalance: wallet.balance, blockedBalance: wallet.blocked_balance },
        transaction_id: request.id, correlation_id: key.slice(0, 120),
        metadata: { beneficiaryType: 'HUB', hubId: hub.id, amount, frequency: preference.frequency },
      }));
      const response = {
        requestId: request.id, hubId: hub.id, amount, currencyUnit: 'TOMAN',
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

  async reviewPayout(requestId: string, decision: 'APPROVE' | 'REJECT', note: string | undefined, key: string, actor: UserPayload) {
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
      throw new ForbiddenException('Only an administrator can review payout requests');
    }
    if (!requestId) throw new BadRequestException('requestId is required');
    if (!['APPROVE', 'REJECT'].includes(decision)) throw new BadRequestException('decision must be APPROVE or REJECT');
    this.validateKey(key);
    const normalizedNote = note?.trim() || null;
    if (normalizedNote && normalizedNote.length > 500) throw new BadRequestException('note must be at most 500 characters');
    const operation = 'settlement.hub-payout-review';
    const hash = this.hash({ requestId, decision, note: normalizedNote, operation });

    return this.dataSource.transaction(async (manager) => {
      const idem = await this.getIdempotency(manager, actor.sub, operation, key, hash);
      if (idem.state === IdempotencyState.COMPLETED) return idem.response_body;
      const repo = manager.getRepository(SettlementTransactionEntity);
      const qb = repo.createQueryBuilder('s').where('s.id = :requestId', { requestId });
      if (manager.connection.options.type === 'postgres') qb.setLock('pessimistic_write');
      const request = await qb.getOne();
      if (!request) throw new NotFoundException('Payout request not found');
      if (![SettlementTransactionType.HUB_PAYOUT, SettlementTransactionType.COURIER_PAYOUT].includes(request.transaction_type)) {
        throw new BadRequestException('Settlement transaction is not a hub/courier payout request');
      }
      if (request.status !== SettlementTransactionStatus.REQUESTED) {
        throw new ConflictException('Only REQUESTED payout items can be reviewed');
      }

      if (decision === 'REJECT') {
        const walletRepo = manager.getRepository(WalletEntity);
        const wallet = await this.lockWalletById(manager, request.wallet_id);
        const amount = Number(request.amount);
        if (!wallet || Number(wallet.blocked_balance ?? 0) < amount) {
          throw new ConflictException('Reserved funds are not available to release');
        }
        wallet.blocked_balance = Number(wallet.blocked_balance ?? 0) - amount;
        wallet.balance += amount;
        if (wallet.balance > 2_147_483_647) throw new ConflictException('Available wallet balance would exceed supported range');
        await walletRepo.save(wallet);
        const reviewLedger = manager.getRepository(WalletTransactionEntity);
        await reviewLedger.save(reviewLedger.create({
          wallet_id: wallet.id, actor_id: actor.sub, idempotency_record_id: idem.id,
          transaction_type: WalletTransactionType.RELEASE_HOLD, bucket: WalletBucket.BLOCKED,
          amount: String(amount), bucket_balance_after: String(wallet.blocked_balance), currency_unit: 'TOMAN',
          reference_type: 'SETTLEMENT', reference_id: request.id, description: 'Release reserved funds after payout rejection',
        }));
        await reviewLedger.save(reviewLedger.create({
          wallet_id: wallet.id, actor_id: actor.sub, idempotency_record_id: idem.id,
          transaction_type: WalletTransactionType.RELEASE_HOLD, bucket: WalletBucket.AVAILABLE,
          amount: String(amount), bucket_balance_after: String(wallet.balance), currency_unit: 'TOMAN',
          reference_type: 'SETTLEMENT', reference_id: request.id, description: 'Release reserved funds after payout rejection',
        }));
        request.status = SettlementTransactionStatus.REJECTED;
      } else {
        // Approval is an authorization decision only; the funds remain blocked until a separately
        // integrated payout provider reports a verified outcome.
        request.status = SettlementTransactionStatus.APPROVED;
      }
      request.reviewed_by = actor.sub;
      request.reviewed_at = new Date();
      request.review_note = normalizedNote;
      await repo.save(request);
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub, actor_role: actor.role, entity_type: 'settlement_transaction', entity_id: request.id,
        action: 'PAYOUT_REQUEST_REVIEWED', old_state: { status: SettlementTransactionStatus.REQUESTED },
        new_state: { status: request.status, fundsReleased: decision === 'REJECT' },
        transaction_id: request.id, correlation_id: key.slice(0, 120),
        metadata: { decision, amount: Number(request.amount), beneficiaryType: request.transaction_type === SettlementTransactionType.COURIER_PAYOUT ? 'COURIER' : 'HUB' },
      }));
      const response = {
        requestId: request.id, hubId: request.hub_id,
        courierId: request.transaction_type === SettlementTransactionType.COURIER_PAYOUT ? request.requested_by : null,
        amount: Number(request.amount), status: request.status, reviewedBy: actor.sub, reviewedAt: request.reviewed_at,
        fundsReleased: decision === 'REJECT',
        note: decision === 'APPROVE' ? 'Approved; no external transfer has been executed.' : 'Rejected; reserved funds returned to available balance.',
      };
      idem.state = IdempotencyState.COMPLETED;
      idem.response_status = 200;
      idem.response_body = response;
      idem.completed_at = new Date();
      await manager.getRepository(IdempotencyRecordEntity).save(idem);
      return response;
    });
  }

  async recordTransferResult(
    requestId: string,
    outcome: 'COMPLETED' | 'FAILED',
    transferReference: string,
    failureReason: string | undefined,
    key: string,
    actor: UserPayload,
  ) {
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
      throw new ForbiddenException('Only an administrator can record an external payout result');
    }
    if (!requestId) throw new BadRequestException('requestId is required');
    if (!['COMPLETED', 'FAILED'].includes(outcome)) throw new BadRequestException('outcome must be COMPLETED or FAILED');
    this.validateKey(key);
    const reference = transferReference?.trim();
    if (!reference || reference.length > 160) {
      throw new BadRequestException('An independently confirmed external transfer/result reference of 1-160 characters is required');
    }
    const normalizedFailure = failureReason?.trim() || null;
    if (outcome === 'FAILED' && !normalizedFailure) {
      throw new BadRequestException('failureReason is required when recording a failed transfer');
    }
    if (normalizedFailure && normalizedFailure.length > 500) {
      throw new BadRequestException('failureReason must be at most 500 characters');
    }

    const operation = 'settlement.payout-transfer-result';
    const hash = this.hash({ requestId, outcome, reference, failureReason: normalizedFailure, operation });
    return this.dataSource.transaction(async (manager) => {
      const idem = await this.getIdempotency(manager, actor.sub, operation, key, hash);
      if (idem.state === IdempotencyState.COMPLETED) return idem.response_body;

      const repo = manager.getRepository(SettlementTransactionEntity);
      const query = repo.createQueryBuilder('s').where('s.id = :requestId', { requestId });
      if (manager.connection.options.type === 'postgres') query.setLock('pessimistic_write');
      const request = await query.getOne();
      if (!request) throw new NotFoundException('Payout request not found');
      if (![SettlementTransactionType.HUB_PAYOUT, SettlementTransactionType.COURIER_PAYOUT].includes(request.transaction_type)) {
        throw new BadRequestException('Settlement transaction is not a hub/courier payout request');
      }
      if (request.status !== SettlementTransactionStatus.APPROVED) {
        throw new ConflictException('Only APPROVED payout requests can receive an external transfer result');
      }
      if (!request.wallet_id) throw new ConflictException('Payout request has no linked wallet');

      const wallet = await this.lockWalletById(manager, request.wallet_id);
      const amount = Number(request.amount);
      if (!wallet || !Number.isSafeInteger(amount) || amount <= 0 || Number(wallet.blocked_balance ?? 0) < amount) {
        throw new ConflictException('Reserved payout funds are unavailable or inconsistent');
      }
      wallet.blocked_balance = Number(wallet.blocked_balance ?? 0) - amount;
      if (outcome === 'FAILED') {
        wallet.balance = Number(wallet.balance) + amount;
        if (!Number.isSafeInteger(wallet.balance) || wallet.balance > 2_147_483_647) {
          throw new ConflictException('Available wallet balance would exceed supported range');
        }
      }
      await manager.getRepository(WalletEntity).save(wallet);

      const ledger = manager.getRepository(WalletTransactionEntity);
      if (outcome === 'COMPLETED') {
        await ledger.save(ledger.create({
          wallet_id: wallet.id, actor_id: actor.sub, idempotency_record_id: idem.id,
          transaction_type: WalletTransactionType.PAYOUT, bucket: WalletBucket.BLOCKED,
          amount: String(amount), bucket_balance_after: String(wallet.blocked_balance), currency_unit: 'TOMAN',
          reference_type: 'SETTLEMENT', reference_id: request.id,
          description: 'Externally confirmed payout; reserved funds settled',
        }));
      } else {
        await ledger.save(ledger.create({
          wallet_id: wallet.id, actor_id: actor.sub, idempotency_record_id: idem.id,
          transaction_type: WalletTransactionType.RELEASE_HOLD, bucket: WalletBucket.BLOCKED,
          amount: String(amount), bucket_balance_after: String(wallet.blocked_balance), currency_unit: 'TOMAN',
          reference_type: 'SETTLEMENT', reference_id: request.id,
          description: 'Release reserved funds after externally confirmed payout failure',
        }));
        await ledger.save(ledger.create({
          wallet_id: wallet.id, actor_id: actor.sub, idempotency_record_id: idem.id,
          transaction_type: WalletTransactionType.RELEASE_HOLD, bucket: WalletBucket.AVAILABLE,
          amount: String(amount), bucket_balance_after: String(wallet.balance), currency_unit: 'TOMAN',
          reference_type: 'SETTLEMENT', reference_id: request.id,
          description: 'Return failed payout funds to available balance',
        }));
      }

      const oldStatus = request.status;
      request.status = outcome === 'COMPLETED' ? SettlementTransactionStatus.COMPLETED : SettlementTransactionStatus.FAILED;
      request.provider_reference = reference;
      request.failure_reason = outcome === 'FAILED' ? normalizedFailure : null;
      request.completed_at = new Date();
      await repo.save(request);
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub, actor_role: actor.role, entity_type: 'settlement_transaction', entity_id: request.id,
        action: 'PAYOUT_EXTERNAL_RESULT_RECORDED', old_state: { status: oldStatus },
        new_state: { status: request.status, transferReference: reference, fundsReleased: outcome === 'FAILED' },
        transaction_id: request.id, correlation_id: key.slice(0, 120),
        metadata: {
          outcome, amount, beneficiaryType: request.transaction_type === SettlementTransactionType.COURIER_PAYOUT ? 'COURIER' : 'HUB',
          externalConfirmation: 'MANUAL_OPERATOR_ATTESTATION',
          note: 'No bank/provider API was called; reference was entered after out-of-band confirmation',
        },
      }));
      const response = {
        requestId: request.id, status: request.status, amount, currencyUnit: request.currency_unit,
        transferReference: reference, failureReason: request.failure_reason,
        availableBalance: wallet.balance, blockedBalance: wallet.blocked_balance,
        fundsReleased: outcome === 'FAILED',
        note: outcome === 'COMPLETED'
          ? 'External transfer was recorded as completed based on the operator-supplied confirmation reference.'
          : 'External transfer failure was recorded; reserved funds returned to available balance.',
      };
      idem.state = IdempotencyState.COMPLETED;
      idem.response_status = 200;
      idem.response_body = response;
      idem.completed_at = new Date();
      await manager.getRepository(IdempotencyRecordEntity).save(idem);
      return response;
    });
  }

  async listPendingPayouts(actor: UserPayload) {
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
      throw new ForbiddenException('Only an administrator can read the payout review queue');
    }
    const rows = await this.dataSource.getRepository(SettlementTransactionEntity).createQueryBuilder('s')
      .where('s.transaction_type IN (:...types)', {
        types: [SettlementTransactionType.HUB_PAYOUT, SettlementTransactionType.COURIER_PAYOUT],
      })
      .andWhere('s.status = :status', { status: SettlementTransactionStatus.REQUESTED })
      .orderBy('s.created_at', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .getMany();
    return rows.map((row) => ({
      requestId: row.id,
      beneficiaryType: row.transaction_type === SettlementTransactionType.COURIER_PAYOUT ? 'COURIER' : 'HUB',
      courierId: row.transaction_type === SettlementTransactionType.COURIER_PAYOUT ? row.requested_by : null,
      hubId: row.hub_id,
      amount: Number(row.amount),
      currencyUnit: row.currency_unit,
      status: row.status,
      requestedBy: row.requested_by,
      createdAt: row.created_at,
    }));
  }

  async listForHub(hubId: string, actor: UserPayload) {
    const hub = await this.dataSource.getRepository(HubEntity).findOne({ where: { id: hubId } });
    if (!hub) throw new NotFoundException('Hub not found');
    if (actor.role === UserRole.HUB_OWNER && hub.owner_id !== actor.sub) {
      throw new ForbiddenException('Hub owners may only read their own hub payout history');
    }
    if (![UserRole.HUB_OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
      throw new ForbiddenException('Role cannot read payout history');
    }
    const rows = await this.dataSource.getRepository(SettlementTransactionEntity).find({
      where: { hub_id: hubId, transaction_type: SettlementTransactionType.HUB_PAYOUT },
      order: { created_at: 'DESC', id: 'DESC' },
    });
    return rows.map((row) => ({
      requestId: row.id, hubId: row.hub_id, amount: Number(row.amount), currencyUnit: row.currency_unit,
      status: row.status, requestedBy: row.requested_by, reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at, reviewNote: row.review_note, createdAt: row.created_at,
      transferReference: [SettlementTransactionStatus.COMPLETED, SettlementTransactionStatus.FAILED].includes(row.status) ? row.provider_reference : null,
      failureReason: row.failure_reason, completedAt: row.completed_at,
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
