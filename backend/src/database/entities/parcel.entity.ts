import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

  @Column({ nullable: true })  // ← مهم: اگر هاب نداریم، nullable باشد
  proposed_hub_id: string;

  @Column({ nullable: true })  // ← مهم: برای تست
  courier_id: string;

  @Column({ type: 'varchar', length: 30, default: 'DELIVERY_ATTEMPT' })
  status: string;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  weight_kg?: number;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'timestamptz', nullable: true })
  delivered_to_hub_at?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}