import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

export enum ParcelInvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  USED = 'USED',
}

@Entity('parcel_invitations')
@Index('idx_parcel_invitations_recipient_status', ['recipient_id', 'status'])
@Index('idx_parcel_invitations_courier_created', ['courier_id', 'created_at'])
export class ParcelInvitationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: databaseUuidColumnType })
  courier_id: string;

  @Column({ type: databaseUuidColumnType })
  recipient_id: string;

  @Column({ type: 'varchar', length: 15 })
  recipient_phone: string;

  @Column({ type: 'varchar', length: 20, default: ParcelInvitationStatus.PENDING })
  status: ParcelInvitationStatus;

  @Column({ type: databaseDateColumnType, nullable: true })
  responded_at?: Date;

  @Column({ type: databaseDateColumnType, nullable: true })
  accepted_at?: Date;

  @Column({ type: databaseUuidColumnType, nullable: true })
  parcel_id?: string;

  @CreateDateColumn({ type: databaseDateColumnType })
  created_at: Date;

  @UpdateDateColumn({ type: databaseDateColumnType })
  updated_at: Date;
}
