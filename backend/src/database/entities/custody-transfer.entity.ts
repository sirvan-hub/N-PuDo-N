import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

export enum CustodyTransferType {
  COURIER_TO_HUB = 'COURIER_TO_HUB',
  HUB_TO_HUB = 'HUB_TO_HUB',
  HUB_TO_RECIPIENT = 'HUB_TO_RECIPIENT',
}

export enum CustodyTransferStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
}

@Entity('custody_transfers')
export class CustodyTransferEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: databaseUuidColumnType }) parcel_id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) from_hub_id?: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) to_hub_id?: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) sender_id?: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) receiver_id?: string;
  @Column({ type: 'varchar', length: 32 }) transfer_type: CustodyTransferType;
  @Column({ type: 'varchar', length: 16, default: CustodyTransferStatus.PENDING }) status: CustodyTransferStatus;
  @Column({ type: 'varchar', length: 32 }) code_salt: string;
  @Column({ type: 'varchar', length: 64 }) code_hash: string;
  @Column({ type: databaseDateColumnType }) expires_at: Date;
  @Column({ type: databaseDateColumnType, nullable: true }) code_verified_at?: Date;
  @Column({ type: 'varchar', length: 512, nullable: true }) hub_handover_evidence_ref?: string;
  @Column({ type: 'varchar', length: 512, nullable: true }) recipient_handover_evidence_ref?: string;
  @Column({ type: databaseDateColumnType, nullable: true }) recipient_handover_at?: Date;
  @Column({ type: databaseDateColumnType, nullable: true }) consumed_at?: Date;
  @Column({ type: 'int', default: 0 }) failed_attempts: number;
  @Column({ type: databaseUuidColumnType, nullable: true }) idempotency_record_id?: string;
  @Column({ type: 'text', nullable: true }) failure_reason?: string;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
  @Column({ type: databaseDateColumnType, nullable: true }) completed_at?: Date;
}
