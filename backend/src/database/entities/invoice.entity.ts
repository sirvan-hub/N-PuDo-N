import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ParcelEntity } from './parcel.entity';
import { databaseDateColumnType, databaseJsonColumnType, databaseUuidColumnType } from '../database-column-types';

export enum PaymentStatus { PENDING = 'PENDING', PAID = 'PAID', FAILED = 'FAILED', REFUNDED = 'REFUNDED', OVERDUE = 'OVERDUE', CANCELLED = 'CANCELLED' }

@Entity('invoices')
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 30, unique: true }) invoice_number: string;
  @Column({ type: databaseUuidColumnType }) @Index() parcel_id: string;
  @ManyToOne(() => ParcelEntity) @JoinColumn({ name: 'parcel_id' }) parcel: ParcelEntity;
  @Column({ type: databaseUuidColumnType }) recipient_id: string;
  @Column({ type: databaseUuidColumnType }) hub_id: string;
  @Column({ type: 'integer' }) base_post_cost: number;
  @Column({ type: 'decimal', precision: 6, scale: 2 }) elapsed_hours: number;
  @Column({ type: 'decimal', precision: 5, scale: 2 }) fee_percentage: number;
  @Column({ type: 'integer' }) calculated_fee: number;
  @Column({ type: 'integer' }) total_amount: number;
  @Column({ type: 'varchar', length: 20, default: PaymentStatus.PENDING }) status: PaymentStatus;
  @Column({ type: 'integer' }) hub_owner_share: number;
  @Column({ type: 'integer' }) platform_fee: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) hub_share_percent: number;
  @Column({ type: databaseJsonColumnType }) tariff_snapshot: Record<string, unknown>;
  @Column({ type: databaseUuidColumnType, nullable: true }) tariff_version_id?: string;
  @Column({ type: databaseJsonColumnType, nullable: true }) hub_share_snapshot: Record<string, unknown>;
  @Column({ type: databaseDateColumnType, nullable: true }) paid_at: Date;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
  @UpdateDateColumn({ type: databaseDateColumnType }) updated_at: Date;
}
