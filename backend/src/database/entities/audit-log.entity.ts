import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { databaseDateColumnType, databaseJsonColumnType, databaseUuidColumnType } from '../database-column-types';

@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) actor_id?: string;
  @Column({ type: 'varchar', length: 32, nullable: true }) actor_role?: string;
  @Column({ type: 'varchar', length: 64 }) entity_type: string;
  @Column({ type: databaseUuidColumnType, nullable: true }) entity_id?: string;
  @Column({ type: 'varchar', length: 80 }) action: string;
  @Column({ type: databaseJsonColumnType, nullable: true }) old_state?: Record<string, unknown>;
  @Column({ type: databaseJsonColumnType, nullable: true }) new_state?: Record<string, unknown>;
  @Column({ type: databaseUuidColumnType, nullable: true }) transaction_id?: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) correlation_id?: string;
  @Column({ type: databaseJsonColumnType, default: '{}' }) metadata: Record<string, unknown>;
  @CreateDateColumn({ type: databaseDateColumnType }) created_at: Date;
}
