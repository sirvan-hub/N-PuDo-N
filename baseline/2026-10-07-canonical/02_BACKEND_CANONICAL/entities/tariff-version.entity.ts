import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TariffStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

@Entity('tariff_versions')
export class TariffVersionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 20 }) version: string;
  @Column({ type: 'simple-enum', enum: TariffStatus, default: TariffStatus.ACTIVE }) status: TariffStatus;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0.20 }) fee_percentage_under_12h: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0.40 }) fee_percentage_under_24h: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0.50 }) fee_percentage_per_additional_24h: number;
  @Column({ type: 'int', default: 12 }) threshold_12h_hours: number;
  @Column({ type: 'int', default: 24 }) threshold_24h_hours: number;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ type: 'datetime', nullable: true }) effective_from: Date;
  @Column({ type: 'datetime', nullable: true }) effective_until: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
