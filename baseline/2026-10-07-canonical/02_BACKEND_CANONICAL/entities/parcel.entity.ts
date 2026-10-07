import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index, VersionColumn, OneToMany, JoinColumn } from 'typeorm';
import { ParcelStatus } from '../../modules/parcels/parcel.state-machine';
import { RegistrationTransactionEntity } from './registration-transaction.entity';
import { CustodyTransferEntity } from './custody-transfer.entity';
import { SettlementTransactionEntity } from './settlement-transaction.entity';

@Entity('parcels')
export class ParcelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  tracking_code: string;

  @Column()
  recipient_phone: string;

  @Column()
  recipient_name: string;

  @Column()
  recipient_address: string;

  @Column('int')
  base_post_cost: number;

  @Column({ nullable: true })
  proposed_hub_id: string;

  @Column({ nullable: true })
  courier_id: string;

  @Column({
    type: 'simple-enum',
    enum: ParcelStatus,
    default: ParcelStatus.DELIVERY_ATTEMPT,
  })
  @Index()
  status: ParcelStatus;

  @Column({ nullable: true })
  weight_kg?: number;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  delivered_at?: Date;

  @Column({ nullable: true })
  delivered_to_hub_at?: Date;

  @Column({ nullable: true })
  approved_at?: Date;

  @Column({ nullable: true })
  rejected_reason?: string;

  @Column({ nullable: true })
  handover_scheduled_at?: Date;

  @Column({ nullable: true })
  handover_completed_at?: Date;

  @Column({ nullable: true })
  transferred_to_hub_at?: Date;

  @Column({ nullable: true })
  ready_for_pickup_at?: Date;

  @Column({ nullable: true })
  out_for_delivery_at?: Date;

  @Column({ nullable: true })
  returned_at?: Date;

  @Column({ nullable: true })
  expired_at?: Date;

  @Column({ nullable: true })
  cancelled_at?: Date;

  @OneToMany(() => RegistrationTransactionEntity, (rt) => rt.parcel)
  registration_transactions: RegistrationTransactionEntity[];

  @OneToMany(() => CustodyTransferEntity, (ct) => ct.parcel)
  custody_transfers: CustodyTransferEntity[];

  @OneToMany(() => SettlementTransactionEntity, (st) => st.parcel)
  settlement_transactions: SettlementTransactionEntity[];

  @Column({ type: 'int', default: 1 })
  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}