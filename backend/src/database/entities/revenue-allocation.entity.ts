import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { databaseDateColumnType, databaseJsonColumnType, databaseUuidColumnType } from '../database-column-types';

export enum RevenueBeneficiaryType {
  COURIER = 'COURIER',
  HUB = 'HUB',
  PLATFORM = 'PLATFORM',
}

@Entity('revenue_allocations')
@Index('uq_revenue_allocations_charge_beneficiary', ['charge_type', 'charge_id', 'beneficiary_type'], { unique: true })
@Index('idx_revenue_allocations_beneficiary_created', ['beneficiary_type', 'beneficiary_id', 'created_at'])
export class RevenueAllocationEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 32 }) charge_type: string;
  @Column({ type: databaseUuidColumnType }) charge_id: string;
  @Column({ type: databaseUuidColumnType }) parcel_id: string;
  @Column({ type: 'varchar', length: 16 }) beneficiary_type: RevenueBeneficiaryType;
  @Column({ type: databaseUuidColumnType, nullable: true }) beneficiary_id?: string;
  @Column({ type: 'decimal', precision: 5, scale: 2 }) percentage: number;
  @Column({ type: 'bigint' }) amount: string;
  @Column({ type: 'varchar', length: 12, default: 'TOMAN' }) currency_unit: string;
  @Column({ type: databaseJsonColumnType }) allocation_snapshot: Record<string, unknown>;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
}
