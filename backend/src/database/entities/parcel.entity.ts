import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { HubEntity } from './hub.entity';

export enum ParcelStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED_BY_RECIPIENT = 'APPROVED_BY_RECIPIENT',
  IN_TRANSIT_TO_HUB = 'IN_TRANSIT_TO_HUB',
  DELIVERED_TO_HUB = 'DELIVERED_TO_HUB',
  WAITING_FOR_PICKUP = 'WAITING_FOR_PICKUP',
  PICKED_UP = 'PICKED_UP',
  EXPIRED_RTS = 'EXPIRED_RTS',
  RETURNED_TO_SENDER = 'RETURNED_TO_SENDER',
  REJECTED = 'REJECTED',
}

@Entity('parcels')
export class ParcelEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 20 }) @Index() tracking_code: string;
  @Column({ type: 'varchar', length: 100 }) sender_name: string;
  @Column({ type: 'varchar', length: 15 }) sender_phone: string;
  @Column({ type: 'uuid' }) @Index() recipient_id: string;
  @ManyToOne(() => UserEntity) @JoinColumn({ name: 'recipient_id' }) recipient: UserEntity;
  @Column({ type: 'varchar', length: 100 }) recipient_name: string;
  @Column({ type: 'varchar', length: 15 }) recipient_phone: string;
  @Column({ type: 'text' }) recipient_address: string;
  @Column({ type: 'uuid', nullable: true }) courier_id: string;
  @Column({ type: 'uuid', nullable: true }) current_hub_id: string;
  @ManyToOne(() => HubEntity) @JoinColumn({ name: 'current_hub_id' }) current_hub: HubEntity;
  @Column({ type: 'integer' }) base_post_cost: number;
  @Column({ type: 'integer', nullable: true }) calculated_hub_fee: number;
  @Column({ type: 'simple-enum', enum: ParcelStatus, default: ParcelStatus.PENDING_APPROVAL }) status: ParcelStatus;
  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) requested_at: Date;
  @Column({ type: 'datetime', nullable: true }) approved_by_recipient_at: Date;
  @Column({ type: 'datetime', nullable: true }) delivered_to_hub_at: Date;
  @Column({ type: 'datetime', nullable: true }) picked_up_at: Date;
  @Column({ type: 'datetime', nullable: true }) expired_at: Date;
  @Column({ type: 'varchar', length: 64, nullable: true }) pickup_otp_hash: string;
  @Column({ type: 'datetime', nullable: true }) pickup_otp_expires_at: Date;
  @Column({ type: 'simple-json', nullable: true }) metadata: Record<string, any>;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
