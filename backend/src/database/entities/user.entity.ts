import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { UserRole } from '../../common/interfaces/user-payload.interface';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 15, unique: true }) @Index() phone: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) full_name: string;
  @Column({ type: 'varchar', length: 10, nullable: true }) national_id: string;
  @Column({ type: 'simple-enum', enum: UserRole, default: UserRole.RECIPIENT }) role: UserRole;
  @Column({ type: 'boolean', default: true }) is_active: boolean;
  @Column({ type: 'boolean', default: false }) is_verified: boolean;
  @Column({ type: 'uuid', nullable: true }) verified_by: string;
  @Column({ type: 'datetime', nullable: true }) verified_at: Date;
  @Column({ type: 'int', default: 0 }) failed_login_attempts: number;
  @Column({ type: 'datetime', nullable: true }) locked_until: Date;
  @Column({ type: 'datetime', nullable: true }) last_login_at: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
