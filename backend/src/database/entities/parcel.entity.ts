import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';
import { ParcelStatus } from '../../modules/parcels/parcel-state-machine';

@Entity('parcels')
export class ParcelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  tracking_code: string;

  @Column()
  recipient_phone: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  barcode?: string;

  @Column({ type: 'integer', nullable: true })
  postal_postage_amount?: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  sender_name?: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  sender_phone?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  label_image_ref?: string;

  @Column()
  recipient_name: string;

  @Column()
  recipient_address: string;

  @Column({ type: 'varchar', length: 10, default: 'MEDIUM' })
  package_size: 'SMALL' | 'MEDIUM' | 'LARGE';

  @Column('int')
  base_post_cost: number;

  @Column({ type: databaseUuidColumnType, nullable: true })
  invitation_id?: string;

  @Column({ type: databaseUuidColumnType, nullable: true })
  tariff_version_id?: string;

  @Column({ type: databaseDateColumnType, nullable: true })
  expired_at?: Date;

  @Column({ type: databaseDateColumnType, nullable: true })
  collected_at?: Date;

  @Column({ type: databaseUuidColumnType, nullable: true })
  proposed_hub_id: string;

  @Column({ type: databaseUuidColumnType, nullable: true })
  recipient_id?: string;

  @Column({ type: databaseUuidColumnType, nullable: true })
  current_hub_id?: string;

  @Column({ nullable: true })  // ← مهم: برای تست
  courier_id: string;

  @Column({ type: 'varchar', length: 30, default: ParcelStatus.DELIVERY_ATTEMPT })
  status: ParcelStatus;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  weight_kg?: number;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  courier_handover_evidence_ref?: string;

  @Column({ type: databaseDateColumnType, nullable: true })
  courier_handover_at?: Date;

  @Column({ type: 'varchar', length: 512, nullable: true })
  hub_receipt_evidence_ref?: string;

  @Column({ type: databaseDateColumnType, nullable: true })
  hub_receipt_confirmed_at?: Date;

  @Column({ type: databaseDateColumnType, nullable: true })
  delivered_to_hub_at?: Date;

  @CreateDateColumn({ type: databaseDateColumnType })
  created_at: Date;

  @UpdateDateColumn({ type: databaseDateColumnType })
  updated_at: Date;
}