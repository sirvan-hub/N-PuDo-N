import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

@Entity('hub_share_settings')
export class HubShareSettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 30 })
  percentage: number;

  @Column({ type: databaseUuidColumnType, nullable: true })
  updated_by: string;

  @UpdateDateColumn({ type: databaseDateColumnType })
  updated_at: Date;
}
