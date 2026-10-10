import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { databaseDateColumnType, databaseJsonColumnType, databaseUuidColumnType } from '../database-column-types';

@Entity('hubs')
export class HubEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: databaseUuidColumnType }) @Index() owner_id: string;
  @ManyToOne(() => UserEntity) @JoinColumn({ name: 'owner_id' }) owner: UserEntity;
  @Column({ type: 'varchar', length: 150 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ type: 'varchar', length: 15, nullable: true }) phone: string;
  @Column({ type: 'text' }) address: string;
  @Column({ type: 'varchar', length: 50 }) city: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) district: string;
  @Column({ type: databaseJsonColumnType }) operating_hours: Record<string, { open: string; close: string }>;
  @Column({ type: 'int', default: 100 }) max_capacity: number;
  @Column({ type: 'int', default: 0 }) current_capacity: number;
  @Column({ type: 'boolean', default: true }) is_active: boolean;
  @Column({ type: 'boolean', default: false }) is_temporarily_closed: boolean;
  @Column({ type: 'varchar', length: 64, unique: true }) qr_code_hash: string;
  @Column({ type: 'decimal', precision: 2, scale: 1, default: 0 }) rating: number;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
  @UpdateDateColumn({ type: databaseDateColumnType }) updated_at: Date;
}
