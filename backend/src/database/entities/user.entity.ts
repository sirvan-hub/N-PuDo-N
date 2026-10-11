import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { UserRole } from '../../common/interfaces/user-payload.interface';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 32, nullable: true, unique: true }) username: string;
  @Column({ type: 'varchar', length: 255, nullable: true, select: false }) password_hash: string;
  @Column({ type: 'varchar', length: 15, unique: true }) @Index() phone: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) full_name: string;
  @Column({ type: 'varchar', length: 10, nullable: true }) national_id: string;
  @Column({ type: 'varchar', length: 20, default: UserRole.RECIPIENT }) role: UserRole;
  @Column({ type: 'boolean', default: true }) is_active: boolean;
  @Column({ type: 'boolean', default: false }) is_verified: boolean;
  @Column({ type: databaseUuidColumnType, nullable: true }) verified_by: string;
  @Column({ type: databaseDateColumnType, nullable: true }) verified_at: Date;
  @Column({ type: 'int', default: 0 }) failed_login_attempts: number;
  @Column({ type: databaseDateColumnType, nullable: true }) locked_until: Date;
  @Column({ type: databaseDateColumnType, nullable: true }) last_login_at: Date;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
  @UpdateDateColumn({ type: databaseDateColumnType }) updated_at: Date;
}
