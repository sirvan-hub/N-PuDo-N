import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

export enum SettlementTransactionType {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  HUB_PAYOUT = 'HUB_PAYOUT',
  COURIER_PAYOUT = 'COURIER_PAYOUT',
  HOLD = 'HOLD',
  RELEASE = 'RELEASE',
}

export enum SettlementTransactionStatus {
  PENDING = 'PENDING',
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('settlement_transactions')
@Index('idx_settlement_invoice_created', ['invoice_id', 'created_at'])
export class SettlementTransactionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) parcel_id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) invoice_id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) wallet_id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) hub_id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) actor_id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) requested_by: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) reviewed_by: string;
  @Column({ type: databaseDateColumnType, nullable: true }) reviewed_at: Date;
  @Column({ type: 'varchar', length: 500, nullable: true }) review_note: string;
  @Column({ type: 'varchar', length: 24 }) transaction_type: SettlementTransactionType;
  @Column({ type: 'varchar', length: 16, default: SettlementTransactionStatus.PENDING }) status: SettlementTransactionStatus;
  @Column({ type: 'bigint' }) amount: string;
  @Column({ type: 'varchar', length: 12, default: 'TOMAN' }) currency_unit: string;
  @Column({ type: databaseUuidColumnType, nullable: true, unique: true }) idempotency_record_id: string;
  @Column({ type: 'varchar', length: 160, nullable: true }) provider_reference: string;
  @Column({ type: 'text', nullable: true }) failure_reason: string;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
  @Column({ type: databaseDateColumnType, nullable: true }) completed_at: Date;
}
