import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ParcelEntity } from './parcel.entity';
import { UserEntity } from './user.entity';
import { HubEntity } from './hub.entity';

export enum CustodyTransferType {
  HANDOVER = 'HANDOVER',
  TRANSFER_TO_HUB = 'TRANSFER_TO_HUB',
  RECEIVE_AT_HUB = 'RECEIVE_AT_HUB',
  DELIVER_TO_CUSTOMER = 'DELIVER_TO_CUSTOMER',
  RETURN = 'RETURN',
}

export enum CustodyTransferStatus {
  INITIATED = 'INITIATED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('custody_transfers')
export class CustodyTransferEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) parcel_id: string;
  @ManyToOne(() => ParcelEntity) @JoinColumn({ name: 'parcel_id' }) parcel: ParcelEntity;
  @Column({ type: 'uuid', nullable: true }) from_hub_id: string;
  @ManyToOne(() => HubEntity) @JoinColumn({ name: 'from_hub_id' }) from_hub: HubEntity;
  @Column({ type: 'uuid', nullable: true }) to_hub_id: string;
  @ManyToOne(() => HubEntity) @JoinColumn({ name: 'to_hub_id' }) to_hub: HubEntity;
  @Column({ type: 'uuid', nullable: true }) courier_id: string;
  @ManyToOne(() => UserEntity, { nullable: true }) @JoinColumn({ name: 'courier_id' }) courier: UserEntity;
  @Column({ type: 'uuid', nullable: true }) receiver_id: string;
  @ManyToOne(() => UserEntity, { nullable: true }) @JoinColumn({ name: 'receiver_id' }) receiver: UserEntity;
  @Column({ type: 'simple-enum', enum: CustodyTransferType }) transfer_type: CustodyTransferType;
  @Column({ type: 'simple-enum', enum: CustodyTransferStatus, default: CustodyTransferStatus.INITIATED }) status: CustodyTransferStatus;
  @Column({ type: 'varchar', length: 6, nullable: true }) custody_code: string;
  @Column({ type: 'text', nullable: true }) metadata: string;
  @Column({ type: 'text', nullable: true }) failure_reason: string;
  @Column({ type: 'datetime', nullable: true }) completed_at: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
