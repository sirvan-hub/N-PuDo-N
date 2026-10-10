import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { databaseDateColumnType, databaseUuidColumnType } from '../database-column-types';

export enum PayoutFrequency {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

/**
 * Stores only an opaque destination token/reference, never a full bank account or IBAN.
 * Until a payment-provider adapter is approved, verification is a manual administrator attestation.
 */
@Entity('payout_preferences')
export class PayoutPreferenceEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: databaseUuidColumnType, unique: true }) @Index() user_id: string;
  @Column({ type: 'varchar', length: 10, default: PayoutFrequency.MONTHLY }) frequency: PayoutFrequency;
  @Column({ type: 'varchar', length: 160, nullable: true }) destination_token: string;
  @Column({ type: 'varchar', length: 4, nullable: true }) destination_last4: string;
  @Column({ type: databaseDateColumnType, nullable: true }) destination_verified_at: Date;
  @Column({ type: databaseUuidColumnType, nullable: true }) destination_verified_by: string;
  @Column({ type: 'varchar', length: 160, nullable: true }) verification_reference: string;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
  @UpdateDateColumn({ type: databaseDateColumnType }) updated_at: Date;
}
