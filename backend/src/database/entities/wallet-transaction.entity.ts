import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

export enum WalletBucket {
  AVAILABLE = 'AVAILABLE',
  PENDING = 'PENDING',
  BLOCKED = 'BLOCKED',
}

export enum WalletTransactionType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  OPENING_PENDING = 'OPENING_PENDING',
  OPENING_BLOCKED = 'OPENING_BLOCKED',
  EARNING_CREDIT = 'EARNING_CREDIT',
  PENDING_CREDIT = 'PENDING_CREDIT',
  RELEASE_PENDING = 'RELEASE_PENDING',
  HOLD = 'HOLD',
  RELEASE_HOLD = 'RELEASE_HOLD',
  DEBIT = 'DEBIT',
  PAYOUT = 'PAYOUT',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity('wallet_transactions')
@Index('idx_wallet_transactions_wallet_created', ['wallet_id', 'created_at'])
export class WalletTransactionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: databaseUuidColumnType }) wallet_id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) actor_id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) idempotency_record_id: string;
  @Column({ type: 'varchar', length: 40 }) transaction_type: WalletTransactionType;
  @Column({ type: 'varchar', length: 16 }) bucket: WalletBucket;
  @Column({ type: 'bigint' }) amount: string;
  @Column({ type: 'bigint' }) bucket_balance_after: string;
  @Column({ type: 'varchar', length: 12, default: 'TOMAN' }) currency_unit: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) reference_type: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) reference_id: string;
  @Column({ type: 'text', nullable: true }) description: string;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
}
