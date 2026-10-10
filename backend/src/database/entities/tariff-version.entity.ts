import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';
import { databaseDateColumnType } from '../database-column-types';

@Entity('tariff_versions')
@Index('idx_tariff_versions_active_effective', ['is_active', 'effective_from', 'effective_until'])
export class TariffVersionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 80, unique: true }) version_key: string;
  @Column({ type: databaseDateColumnType }) effective_from: Date;
  @Column({ type: databaseDateColumnType, nullable: true }) effective_until: Date | null;
  @Column({ type: 'boolean', default: false }) is_active: boolean;
  @Column({ type: 'bigint' }) small_base_amount: string;
  @Column({ type: 'bigint' }) medium_base_amount: string;
  @Column({ type: 'bigint' }) large_base_amount: string;
  @Column({ type: 'decimal', precision: 7, scale: 2, default: 20 }) under_12h_percent: string;
  @Column({ type: 'decimal', precision: 7, scale: 2, default: 40 }) from_12_to_24h_percent: string;
  @Column({ type: 'decimal', precision: 7, scale: 2, default: 50 }) additional_started_24h_percent: string;
  @Column({ type: 'integer', default: 168 }) expiry_hours: number;
  @Column({ type: 'varchar', length: 16, default: 'CEIL' }) rounding_mode: string;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
}
