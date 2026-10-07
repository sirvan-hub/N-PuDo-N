import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ParcelEntity } from './parcel.entity';
import { UserEntity } from './user.entity';
import { HubEntity } from './hub.entity';
import { WalletEntity } from './wallet.entity';

export enum SettlementTransactionType {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  FEE_COLLECTION = 'FEE_COLLECTION',
  HUB_OWNER_PAYOUT = 'HUB_OWNER_PAYOUT',
  PLATFORM_FEE = 'PLATFORM_FEE',
  HOLD = 'HOLD',
  RELEASE = 'RELEASE',
}

export enum SettlementTransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('settlement_transactions')
export class SettlementTransactionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) parcel_id: string;
  @ManyToOne(() => ParcelEntity) @JoinColumn({ name: 'parcel_id' }) parcel: ParcelEntity;
  @Column({ type: 'uuid', nullable: true }) hub_id: string;
  @ManyToOne(() => HubEntity, { nullable: true }) @JoinColumn({ name: 'hub_id' }) hub: HubEntity;
  @Column({ type: 'uuid', nullable: true }) user_id: string;
  @ManyToOne(() => UserEntity, { nullable: true }) @JoinColumn({ name: 'user_id' }) user: UserEntity;
  @Column({ type: 'uuid', nullable: true }) wallet_id: string;
  @ManyToOne(() => WalletEntity, { nullable: true }) @JoinColumn({ name: 'wallet_id' }) wallet: WalletEntity;
  @Column({ type: 'simple-enum', enum: SettlementTransactionType }) transaction_type: SettlementTransactionType;
  @Column({ type: 'simple-enum', enum: SettlementTransactionStatus, default: SettlementTransactionStatus.PENDING }) status: SettlementTransactionStatus;
  @Column({ type: 'integer', default: 0 }) amount: number;
  @Column({ type: 'integer', default: 0 }) balance_after: number;
  @Column({ type: 'integer', default: 0 }) hub_owner_share: number;
  @Column({ type: 'integer', default: 0 }) platform_fee: number;
  @Column({ type: 'text', nullable: true }) metadata: string;
  @Column({ type: 'text', nullable: true }) failure_reason: string;
  @Column({ type: 'datetime', nullable: true }) completed_at: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
