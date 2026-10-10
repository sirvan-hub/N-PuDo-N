import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';
import { databaseDateColumnType, databaseJsonColumnType } from '../database-column-types';

export enum IdempotencyState {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('idempotency_records')
@Index('uq_idempotency_scope_operation_key', ['actor_scope', 'operation_type', 'idempotency_key'], { unique: true })
export class IdempotencyRecordEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 120 }) actor_scope: string;
  @Column({ type: 'varchar', length: 80 }) operation_type: string;
  @Column({ type: 'varchar', length: 255 }) idempotency_key: string;
  @Column({ type: 'char', length: 64 }) request_hash: string;
  @Column({ type: 'varchar', length: 16, default: IdempotencyState.IN_PROGRESS }) state: IdempotencyState;
  @Column({ type: 'integer', nullable: true }) response_status: number;
  @Column({ type: databaseJsonColumnType, nullable: true }) response_body: Record<string, unknown>;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
  @Column({ type: databaseDateColumnType, nullable: true }) completed_at: Date;
}
