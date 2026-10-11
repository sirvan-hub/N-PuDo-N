import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

@Entity('notifications')
@Index('idx_notifications_user_created', ['user_id', 'created_at'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: databaseUuidColumnType }) user_id: string;
  @Column({ type: 'varchar', length: 40 }) category: string;
  @Column({ type: 'varchar', length: 160 }) title: string;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) reference_type?: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) reference_id?: string;
  @Column({ type: databaseDateColumnType, nullable: true }) expires_at?: Date;
  @Column({ type: databaseDateColumnType, nullable: true }) read_at?: Date;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
}
