import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ParcelEntity } from './parcel.entity';
import { UserEntity } from './user.entity';
import { HubEntity } from './hub.entity';

export enum RegistrationTransactionType {
  PUDO_REQUEST = 'PUDO_REQUEST',
  PUDO_ACCEPT = 'PUDO_ACCEPT',
  PUDO_REJECT = 'PUDO_REJECT',
  HUB_SELECTION = 'HUB_SELECTION',
  OFFLINE_ASSIGNMENT = 'OFFLINE_ASSIGNMENT',
}

export enum RegistrationTransactionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

@Entity('registration_transactions')
export class RegistrationTransactionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) parcel_id: string;
  @ManyToOne(() => ParcelEntity) @JoinColumn({ name: 'parcel_id' }) parcel: ParcelEntity;
  @Column({ type: 'uuid', nullable: true }) hub_id: string;
  @ManyToOne(() => HubEntity, { nullable: true }) @JoinColumn({ name: 'hub_id' }) hub: HubEntity;
  @Column({ type: 'uuid', nullable: true }) user_id: string;
  @ManyToOne(() => UserEntity, { nullable: true }) @JoinColumn({ name: 'user_id' }) user: UserEntity;
  @Column({ type: 'simple-enum', enum: RegistrationTransactionType }) transaction_type: RegistrationTransactionType;
  @Column({ type: 'simple-enum', enum: RegistrationTransactionStatus, default: RegistrationTransactionStatus.PENDING }) status: RegistrationTransactionStatus;
  @Column({ type: 'text', nullable: true }) metadata: string;
  @Column({ type: 'text', nullable: true }) rejection_reason: string;
  @Column({ type: 'datetime', nullable: true }) confirmed_at: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
