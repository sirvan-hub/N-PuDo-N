import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

@Entity('wallets')
export class WalletEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: databaseUuidColumnType, unique: true }) @Index() user_id: string;
  @OneToOne(() => UserEntity) @JoinColumn({ name: 'user_id' }) user: UserEntity;
  @Column({ type: 'integer', default: 0 }) balance: number;
  @Column({ type: 'integer', default: 0 }) pending_balance: number;
  @Column({ type: 'integer', default: 0 }) blocked_balance: number;
  @Column({ type: 'integer', default: 0 }) total_earned: number;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
  @UpdateDateColumn({ type: databaseDateColumnType }) updated_at: Date;
}
