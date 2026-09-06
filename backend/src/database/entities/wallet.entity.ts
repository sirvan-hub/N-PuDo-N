import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, OneToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('wallets')
export class WalletEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', unique: true }) @Index() user_id: string;
  @OneToOne(() => UserEntity) @JoinColumn({ name: 'user_id' }) user: UserEntity;
  @Column({ type: 'integer', default: 0 }) balance: number;
  @Column({ type: 'integer', default: 0 }) pending_balance: number;
  @Column({ type: 'integer', default: 0 }) total_earned: number;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
