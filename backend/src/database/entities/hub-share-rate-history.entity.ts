import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

@Entity('hub_share_rate_history')
@Index('idx_hub_share_rate_history_created', ['created_at'])
export class HubShareRateHistoryEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'decimal', precision: 5, scale: 2 }) old_percentage: number;
  @Column({ type: 'decimal', precision: 5, scale: 2 }) new_percentage: number;
  @Column({ type: databaseUuidColumnType, nullable: true }) changed_by: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) reason: string;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
}
