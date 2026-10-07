import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ParcelEntity } from './parcel.entity';
import { UserEntity } from './user.entity';
import { HubEntity } from './hub.entity';

export enum AuditLogAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  HANDOVER = 'HANDOVER',
  TRANSFER = 'TRANSFER',
  DELIVER = 'DELIVER',
  COLLECT = 'COLLECT',
  SETTLE = 'SETTLE',
  REGISTER = 'REGISTER',
  VERIFY = 'VERIFY',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
}

export enum AuditLogTarget {
  PARCEL = 'PARCEL',
  HUB = 'HUB',
  USER = 'USER',
  WALLET = 'WALLET',
  INVOICE = 'INVOICE',
  REGISTRATION = 'REGISTRATION',
  CUSTODY = 'CUSTODY',
  SETTLEMENT = 'SETTLEMENT',
}

@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 50 }) entity_type: string;
  @Column({ type: 'uuid' }) entity_id: string;
  @Column({ type: 'simple-enum', enum: AuditLogAction }) action: AuditLogAction;
  @Column({ type: 'uuid', nullable: true }) user_id: string;
  @ManyToOne(() => UserEntity, { nullable: true }) @JoinColumn({ name: 'user_id' }) user: UserEntity;
  @Column({ type: 'uuid', nullable: true }) hub_id: string;
  @ManyToOne(() => HubEntity, { nullable: true }) @JoinColumn({ name: 'hub_id' }) hub: HubEntity;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ type: 'simple-json', nullable: true }) metadata: Record<string, any>;
  @Column({ type: 'varchar', length: 50, nullable: true }) ip_address: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) user_agent: string;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}
