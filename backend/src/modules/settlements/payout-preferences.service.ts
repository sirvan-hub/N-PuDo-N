import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { PayoutPreferenceEntity, PayoutFrequency } from '../../database/entities/payout-preference.entity';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';

@Injectable()
export class PayoutPreferencesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getMine(actor: UserPayload) {
    this.assertPayoutRole(actor);
    const row = await this.dataSource.getRepository(PayoutPreferenceEntity).findOne({ where: { user_id: actor.sub } });
    return this.present(actor.sub, row);
  }

  async updateMine(input: { frequency?: PayoutFrequency; destinationToken?: string; destinationLast4?: string }, actor: UserPayload) {
    this.assertPayoutRole(actor);
    if (input.frequency !== undefined && !Object.values(PayoutFrequency).includes(input.frequency)) {
      throw new BadRequestException('frequency must be WEEKLY or MONTHLY');
    }
    const hasToken = input.destinationToken !== undefined;
    const hasLast4 = input.destinationLast4 !== undefined;
    if (hasToken !== hasLast4) throw new BadRequestException('destinationToken and destinationLast4 must be supplied together');
    if (hasToken) {
      if (typeof input.destinationToken !== 'string' || input.destinationToken.trim().length < 8 || input.destinationToken.length > 160) {
        throw new BadRequestException('destinationToken must be an opaque provider/reference token, not a bank account number');
      }
      if (!/^\d{4}$/.test(input.destinationLast4 || '')) {
        throw new BadRequestException('destinationLast4 must contain exactly four digits');
      }
      if (/^\d{16,}$/.test(input.destinationToken) || /^IR\d{24}$/i.test(input.destinationToken)) {
        throw new BadRequestException('Do not submit a full card number or IBAN; use an opaque destination token');
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PayoutPreferenceEntity);
      let row = await repo.findOne({ where: { user_id: actor.sub } });
      const oldState = row ? {
        frequency: row.frequency, destinationLast4: row.destination_last4,
        destinationVerified: Boolean(row.destination_verified_at),
      } : null;
      if (!row) row = repo.create({ user_id: actor.sub, frequency: PayoutFrequency.MONTHLY });
      if (input.frequency !== undefined) row.frequency = input.frequency;
      if (hasToken) {
        const changed = row.destination_token !== input.destinationToken!.trim() ||
          row.destination_last4 !== input.destinationLast4;
        row.destination_token = input.destinationToken!.trim();
        row.destination_last4 = input.destinationLast4!;
        if (changed) {
          row.destination_verified_at = null;
          row.destination_verified_by = null;
          row.verification_reference = null;
        }
      }
      row = await repo.save(row);
      const audit = manager.getRepository(AuditLogEntity);
      await audit.save(audit.create({
        actor_id: actor.sub, actor_role: actor.role, entity_type: 'payout_preference',
        entity_id: row.id, action: 'PAYOUT_PREFERENCE_UPDATED',
        old_state: oldState || undefined,
        new_state: { frequency: row.frequency, destinationLast4: row.destination_last4, destinationVerified: Boolean(row.destination_verified_at) },
        metadata: { destinationTokenChanged: hasToken },
      }));
      return this.present(actor.sub, row);
    });
  }

  async verifyDestination(userId: string, verificationReference: string, actor: UserPayload) {
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
      throw new ForbiddenException('Only an administrator can record manual payout-destination verification');
    }
    if (!userId) throw new BadRequestException('userId is required');
    const reference = verificationReference?.trim();
    if (!reference || reference.length > 160) {
      throw new BadRequestException('A verification reference of 1-160 characters is required');
    }
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PayoutPreferenceEntity);
      const row = await repo.findOne({ where: { user_id: userId } });
      if (!row || !row.destination_token || !row.destination_last4) {
        throw new NotFoundException('Payout destination reference has not been configured');
      }
      const oldState = { destinationLast4: row.destination_last4, destinationVerified: Boolean(row.destination_verified_at) };
      row.destination_verified_at = new Date();
      row.destination_verified_by = actor.sub;
      row.verification_reference = reference;
      await repo.save(row);
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub, actor_role: actor.role, entity_type: 'payout_preference',
        entity_id: row.id, action: 'PAYOUT_DESTINATION_MANUALLY_VERIFIED',
        old_state: oldState,
        new_state: { destinationLast4: row.destination_last4, destinationVerified: true },
        correlation_id: reference.slice(0, 120),
        metadata: { userId, verificationMode: 'MANUAL_EXTERNAL_CHECK', warning: 'No bank/provider API is called by this endpoint' },
      }));
      return this.present(userId, row);
    });
  }

  private assertPayoutRole(actor: UserPayload) {
    if (![UserRole.COURIER, UserRole.HUB_OWNER].includes(actor.role)) {
      throw new ForbiddenException('Payout preferences are available only to couriers and hub owners');
    }
  }

  private present(userId: string, row: PayoutPreferenceEntity | null) {
    return {
      userId,
      frequency: row?.frequency || PayoutFrequency.MONTHLY,
      destinationConfigured: Boolean(row?.destination_token && row?.destination_last4),
      destinationLast4: row?.destination_last4 || null,
      destinationVerified: Boolean(row?.destination_verified_at),
      destinationVerifiedAt: row?.destination_verified_at || null,
      verificationReference: row?.verification_reference || null,
      note: 'Store only an opaque provider/reference token. Do not store a full bank account or IBAN. Verification is a manual attestation until an approved provider integration exists.',
    };
  }
}
