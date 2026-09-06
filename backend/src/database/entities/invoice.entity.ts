import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ParcelEntity } from './parcel.entity';

export enum PaymentStatus { PENDING = 'PENDING', PAID = 'PAID', FAILED = 'FAILED', REFUNDED = 'REFUNDED' }

@Entity('invoices')
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 30, unique: true }) invoice_number: string;
  @Column({ type: 'uuid' }) @Index() parcel_id: string;
  @ManyToOne(() => ParcelEntity) @JoinColumn({ name: 'parcel_id' }) parcel: ParcelEntity;
  @Column({ type: 'uuid' }) recipient_id: string;
  @Column({ type: 'uuid' }) hub_id: string;
  @Column({ type: 'integer' }) base_post_cost: number;
  @Column({ type: 'decimal', precision: 6, scale: 2 }) elapsed_hours: number;
  @Column({ type: 'decimal', precision: 5, scale: 2 }) fee_percentage: number;
  @Column({ type: 'integer' }) calculated_fee: number;
  @Column({ type: 'integer' }) total_amount: number;
  @Column({ type: 'simple-enum', enum: PaymentStatus, default: PaymentStatus.PENDING }) status: PaymentStatus;
  @Column({ type: 'integer' }) hub_owner_share: number;
  @Column({ type: 'integer' }) platform_fee: number;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
