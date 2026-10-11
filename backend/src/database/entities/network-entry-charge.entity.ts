import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { databaseDateColumnType, databaseJsonColumnType, databaseUuidColumnType } from '../database-column-types';

export enum NetworkEntryChargeStatus {
  PENDING_RECEIPT = 'PENDING_RECEIPT',
  RECEIPT_SUBMITTED = 'RECEIPT_SUBMITTED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

@Entity('network_entry_charges')
@Index('uq_network_entry_charge_parcel', ['parcel_id'], { unique: true })
@Index('uq_network_entry_charge_provider_reference', ['provider_reference'], { unique: true })
export class NetworkEntryChargeEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: databaseUuidColumnType }) parcel_id: string;
  @Column({ type: 'integer' }) postal_postage_amount: number;
  @Column({ type: 'decimal', precision: 5, scale: 2 }) fee_percent: number;
  @Column({ type: 'integer' }) amount: number;
  @Column({ type: 'varchar', length: 24, default: NetworkEntryChargeStatus.PENDING_RECEIPT }) status: NetworkEntryChargeStatus;
  @Column({ type: 'varchar', length: 512, nullable: true }) receipt_evidence_ref?: string;
  @Column({ type: 'varchar', length: 160, nullable: true }) provider_reference?: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) verified_by?: string;
  @Column({ type: databaseDateColumnType, nullable: true }) verified_at?: Date;
  @Column({ type: databaseJsonColumnType }) tariff_snapshot: Record<string, unknown>;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
  @UpdateDateColumn({ type: databaseDateColumnType }) updated_at: Date;
}
