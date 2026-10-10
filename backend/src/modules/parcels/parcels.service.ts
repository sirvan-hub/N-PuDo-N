import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { ParcelInvitationEntity, ParcelInvitationStatus } from '../../database/entities/parcel-invitation.entity';
import { NetworkEntryChargeEntity, NetworkEntryChargeStatus } from '../../database/entities/network-entry-charge.entity';
import { RevenueAllocationEntity, RevenueBeneficiaryType } from '../../database/entities/revenue-allocation.entity';
import { IdempotencyRecordEntity, IdempotencyState } from '../../database/entities/idempotency-record.entity';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { WalletTransactionEntity, WalletBucket, WalletTransactionType } from '../../database/entities/wallet-transaction.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { NotificationEntity } from '../../database/entities/notification.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { InvoiceEntity, PaymentStatus } from '../../database/entities/invoice.entity';
import { CustodyTransferEntity, CustodyTransferStatus, CustodyTransferType } from '../../database/entities/custody-transfer.entity';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';
import { ParcelStatus, canTransitionParcel } from './parcel-state-machine';
import { PricingService } from '../pricing/pricing.service';
import { InvoicesService } from '../invoices/invoices.service';

export const DELIVERY_CODE_TTL_MS = 60 * 60_000;

@Injectable()
export class ParcelsService {
  constructor(
    @InjectRepository(ParcelEntity) private repo: Repository<ParcelEntity>,
    @InjectRepository(HubEntity) private hubs: Repository<HubEntity>,
    @InjectRepository(UserEntity) private users: Repository<UserEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly pricingService: PricingService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async createInvitation(recipientPhone: string, actor: UserPayload) {
    if (actor.role !== UserRole.COURIER) throw new ForbiddenException('Only a courier can invite a recipient');
    if (!recipientPhone || typeof recipientPhone !== 'string') throw new BadRequestException('recipient_phone is required');

    const recipient = await this.users.findOne({ where: { phone: recipientPhone } });
    if (!recipient || recipient.role !== UserRole.RECIPIENT || !recipient.is_active) {
      throw new BadRequestException('Recipient must have an active registered recipient account');
    }

    return this.dataSource.transaction(async (manager) => {
      const invitations = manager.getRepository(ParcelInvitationEntity);
      const invitation = await invitations.save(invitations.create({
        courier_id: actor.sub,
        recipient_id: recipient.id,
        recipient_phone: recipient.phone,
        status: ParcelInvitationStatus.PENDING,
      }));
      await manager.getRepository(NotificationEntity).save(manager.getRepository(NotificationEntity).create({
        user_id: recipient.id,
        category: 'PARCEL_INVITATION',
        title: 'دعوت تحویل مرسوله با Pudo-N',
        body: 'سفیر پست پیشنهاد داده مرسوله شما از طریق شبکه هاب‌های Pudo-N تحویل شود. برای ادامه، دعوت را تأیید یا رد کنید.',
        reference_type: 'PARCEL_INVITATION',
        reference_id: invitation.id,
      }));
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: UserRole.COURIER,
        entity_type: 'parcel_invitation',
        entity_id: invitation.id,
        action: 'PARCEL_INVITATION_CREATED',
        old_state: null,
        new_state: { status: invitation.status, recipientId: recipient.id },
        transaction_id: invitation.id,
        correlation_id: `parcel-invitation:${invitation.id}`,
        metadata: { recipientPhone: recipient.phone },
      }));
      return invitation;
    });
  }

  async respondToInvitation(invitationId: string, accepted: boolean, actor: UserPayload) {
    if (actor.role !== UserRole.RECIPIENT) throw new ForbiddenException('Only a recipient can respond to an invitation');
    if (typeof accepted !== 'boolean') throw new BadRequestException('accepted must be a boolean');

    return this.dataSource.transaction(async (manager) => {
      const invitations = manager.getRepository(ParcelInvitationEntity);
      const invitation = await invitations.findOne({ where: { id: invitationId } });
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.recipient_id !== actor.sub && invitation.recipient_phone !== actor.phone) {
        throw new ForbiddenException('Invitation belongs to another recipient');
      }
      if (invitation.status !== ParcelInvitationStatus.PENDING) {
        throw new ConflictException('Invitation has already been answered or used');
      }

      const now = new Date();
      const nextStatus = accepted ? ParcelInvitationStatus.ACCEPTED : ParcelInvitationStatus.REJECTED;
      const update = await invitations.update(
        { id: invitation.id, status: ParcelInvitationStatus.PENDING },
        { status: nextStatus, responded_at: now, accepted_at: accepted ? now : null },
      );
      if (!update.affected) throw new ConflictException('Invitation response was already recorded');

      await manager.getRepository(NotificationEntity).save(manager.getRepository(NotificationEntity).create({
        user_id: invitation.courier_id,
        category: 'PARCEL_INVITATION_RESPONSE',
        title: accepted ? 'دعوت Pudo-N تأیید شد' : 'دعوت Pudo-N رد شد',
        body: accepted
          ? 'گیرنده با استفاده از شبکه Pudo-N موافقت کرده است. اکنون می‌توانید اطلاعات مرسوله را ثبت کنید.'
          : 'گیرنده پیشنهاد استفاده از شبکه Pudo-N را رد کرده است؛ مرسوله نباید در شبکه ثبت شود.',
        reference_type: 'PARCEL_INVITATION',
        reference_id: invitation.id,
      }));
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: UserRole.RECIPIENT,
        entity_type: 'parcel_invitation',
        entity_id: invitation.id,
        action: accepted ? 'PARCEL_INVITATION_ACCEPTED' : 'PARCEL_INVITATION_REJECTED',
        old_state: { status: ParcelInvitationStatus.PENDING },
        new_state: { status: nextStatus, respondedAt: now.toISOString() },
        transaction_id: invitation.id,
        correlation_id: `parcel-invitation:${invitation.id}`,
        metadata: {},
      }));
      return { id: invitation.id, status: nextStatus, responded_at: now, accepted_at: accepted ? now : null };
    });
  }

  async create(dto: any, courierId: string) {
    const recipient = await this.users.findOne({ where: { phone: dto.recipient_phone } });
    if (!recipient) throw new BadRequestException('Parcel recipient must have a registered user account');

    if (!dto.invitation_id) throw new BadRequestException('An accepted recipient invitation is required before parcel registration');
    if (!Number.isSafeInteger(dto.postal_postage_amount) || dto.postal_postage_amount < 0) {
      throw new BadRequestException('Actual postal postage amount from the label is required');
    }
    if (typeof dto.barcode !== 'string' || !dto.barcode.trim() ||
        typeof dto.sender_name !== 'string' || !dto.sender_name.trim() ||
        typeof dto.sender_phone !== 'string' || !dto.sender_phone.trim()) {
      throw new BadRequestException('Postal barcode and sender details are required');
    }
    if (typeof dto.label_image_ref !== 'string' || dto.label_image_ref.length < 8 ||
        dto.label_image_ref.length > 512 || /^https?:\/\//i.test(dto.label_image_ref) || dto.label_image_ref.includes('..')) {
      throw new BadRequestException('A private label-photo storage reference is required; public URLs are not accepted');
    }

    const packageSize = dto.package_size || 'MEDIUM';
    const basePrice = await this.pricingService.resolveBaseCost(packageSize, new Date());
    const parcelData = {
      ...dto,
      package_size: packageSize,
      base_post_cost: basePrice.basePostCost,
      invitation_id: dto.invitation_id,
      tariff_version_id: basePrice.tariffVersionId,
      recipient_id: recipient.id,
      current_hub_id: null,
      courier_id: courierId,
      status: ParcelStatus.DELIVERY_ATTEMPT,
      created_at: new Date(),
      updated_at: new Date(),
    };
    if (this.dataSource?.transaction) {
      return this.dataSource.transaction(async (manager) => {
        const invitations = manager.getRepository(ParcelInvitationEntity);
        const invitation = await invitations.findOne({ where: { id: dto.invitation_id } });
        if (!invitation) throw new BadRequestException('Accepted recipient invitation was not found');
        if (invitation.status !== ParcelInvitationStatus.ACCEPTED) {
          throw new ConflictException('Recipient must accept the invitation before parcel registration');
        }
        if (invitation.courier_id !== courierId || invitation.recipient_id !== recipient.id || invitation.recipient_phone !== recipient.phone) {
          throw new ForbiddenException('Invitation does not match this courier and recipient');
        }
        const parcels = manager.getRepository(ParcelEntity);
        const parcel = await parcels.save(parcels.create(parcelData as Partial<ParcelEntity>));
        const consumed = await invitations.update(
          { id: invitation.id, status: ParcelInvitationStatus.ACCEPTED },
          { status: ParcelInvitationStatus.USED, responded_at: invitation.responded_at || new Date(), parcel_id: parcel.id },
        );
        if (!consumed.affected) throw new ConflictException('Invitation has already been used for another parcel');

        const configuredEntryFeePercent = Number(process.env.PUDO_ENTRY_FEE_PERCENT ?? 30);
        if (!Number.isFinite(configuredEntryFeePercent) || configuredEntryFeePercent < 30 || configuredEntryFeePercent > 40) {
          throw new ConflictException('PUDO_ENTRY_FEE_PERCENT must be configured between 30 and 40');
        }
        const entryFeeAmount = Math.ceil(dto.postal_postage_amount * configuredEntryFeePercent / 100);
        if (!Number.isSafeInteger(entryFeeAmount)) throw new BadRequestException('Calculated network-entry fee is outside the supported range');
        const entryCharges = manager.getRepository(NetworkEntryChargeEntity);
        const entryCharge = await entryCharges.save(entryCharges.create({
          parcel_id: parcel.id,
          postal_postage_amount: dto.postal_postage_amount,
          fee_percent: configuredEntryFeePercent,
          amount: entryFeeAmount,
          status: NetworkEntryChargeStatus.PENDING_RECEIPT,
          tariff_snapshot: {
            snapshotVersion: 1,
            chargeType: 'NETWORK_ENTRY',
            basis: 'ACTUAL_POSTAL_POSTAGE_AMOUNT',
            postalPostageAmount: dto.postal_postage_amount,
            feePercent: configuredEntryFeePercent,
            amount: entryFeeAmount,
            currencyUnit: 'TOMAN',
            rounding: 'CEIL',
            capturedAt: new Date().toISOString(),
          },
        }));
        await manager.getRepository(NotificationEntity).save(manager.getRepository(NotificationEntity).create({
          user_id: recipient.id,
          category: 'NETWORK_ENTRY_PAYMENT_REQUIRED',
          title: 'پرداخت هزینه ورود مرسوله به شبکه Pudo-N',
          body: `مبلغ کرایه پستی ثبت‌شده ${dto.postal_postage_amount} تومان است. هزینه ورود به شبکه Pudo-N برابر ${entryFeeAmount} تومان است. رسید را در پنل خود ثبت کنید؛ این مبلغ جدا از کرایه پست است.`,
          reference_type: 'network_entry_charge',
          reference_id: entryCharge.id,
        }));
        await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
          actor_id: courierId,
          actor_role: UserRole.COURIER,
          entity_type: 'parcel',
          entity_id: parcel.id,
          action: 'PARCEL_REGISTERED_ENTRY_CHARGE_CREATED',
          old_state: null,
          new_state: {
            status: parcel.status,
            tariffVersionId: basePrice.tariffVersionId,
            tariffKey: basePrice.tariffKey,
            packageSize,
            basePostCost: basePrice.basePostCost,
            networkEntryChargeId: entryCharge.id,
            networkEntryFee: entryFeeAmount,
          },
          transaction_id: parcel.id,
          correlation_id: `parcel-create:${parcel.id}`,
          metadata: { source: 'parcel-creation', snapshotPolicy: 'tariff-version-pinned', networkEntryFeePolicy: 'actual-postal-postage-times-configured-rate' },
        }));
        return parcel;
      });
    }
    throw new BadRequestException('Transactional persistence is required for consent-gated parcel registration');
  }

  async submitNetworkEntryReceipt(parcelId: string, evidenceRef: string, actor: UserPayload) {
    if (actor.role !== UserRole.RECIPIENT) throw new ForbiddenException('Only the recipient can submit the network-entry receipt');
    if (typeof evidenceRef !== 'string' || evidenceRef.length < 8 || evidenceRef.length > 512 ||
        /^https?:\/\//i.test(evidenceRef) || evidenceRef.includes('..')) {
      throw new BadRequestException('A private receipt storage reference is required; public URLs are not accepted');
    }

    return this.dataSource.transaction(async (manager) => {
      const parcel = await this.findParcelForUpdate(manager, parcelId);
      if (!parcel) throw new NotFoundException('Parcel not found');
      if (parcel.recipient_id !== actor.sub && parcel.recipient_phone !== actor.phone) {
        throw new ForbiddenException('Only the registered recipient can submit this receipt');
      }
      const charges = manager.getRepository(NetworkEntryChargeEntity);
      const charge = await charges.findOne({ where: { parcel_id: parcel.id } });
      if (!charge) throw new NotFoundException('Network-entry charge not found');
      if (charge.status === NetworkEntryChargeStatus.VERIFIED) {
        throw new ConflictException('Network-entry payment is already verified');
      }
      if (charge.status === NetworkEntryChargeStatus.RECEIPT_SUBMITTED) {
        if (charge.receipt_evidence_ref === evidenceRef) return { charge, alreadySubmitted: true };
        throw new ConflictException('A receipt is already awaiting review');
      }
      charge.receipt_evidence_ref = evidenceRef;
      charge.status = NetworkEntryChargeStatus.RECEIPT_SUBMITTED;
      charge.provider_reference = null;
      charge.verified_by = null;
      charge.verified_at = null;
      const saved = await charges.save(charge);
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: actor.role,
        entity_type: 'network_entry_charge',
        entity_id: charge.id,
        action: 'NETWORK_ENTRY_RECEIPT_SUBMITTED',
        old_state: { status: NetworkEntryChargeStatus.PENDING_RECEIPT },
        new_state: { status: NetworkEntryChargeStatus.RECEIPT_SUBMITTED, receiptEvidenceRef: evidenceRef },
        transaction_id: charge.id,
        correlation_id: `network-entry-charge:${charge.id}`,
        metadata: { parcelId: parcel.id, amount: charge.amount, currencyUnit: 'TOMAN' },
      }));
      return { charge: saved, alreadySubmitted: false };
    });
  }

  async listEntryFeePaymentsForReview(limit = 50) {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    return this.dataSource.getRepository(NetworkEntryChargeEntity).find({
      where: { status: NetworkEntryChargeStatus.RECEIPT_SUBMITTED },
      order: { created_at: 'ASC' },
      take: safeLimit,
    });
  }

  async rejectNetworkEntryPayment(chargeId: string, reason: string, actor: UserPayload) {
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
      throw new ForbiddenException('Only an administrator can reject an entry-fee receipt');
    }
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 300) {
      throw new BadRequestException('A rejection reason of 1 to 300 characters is required');
    }
    return this.dataSource.transaction(async (manager) => {
      const charges = manager.getRepository(NetworkEntryChargeEntity);
      const charge = await charges.findOne({ where: { id: chargeId } });
      if (!charge) throw new NotFoundException('Network-entry charge not found');
      if (charge.status !== NetworkEntryChargeStatus.RECEIPT_SUBMITTED) {
        throw new ConflictException('Only submitted entry-fee receipts can be rejected');
      }
      charge.status = NetworkEntryChargeStatus.REJECTED;
      charge.provider_reference = null;
      charge.verified_by = null;
      charge.verified_at = null;
      const saved = await charges.save(charge);
      const parcel = await manager.getRepository(ParcelEntity).findOne({ where: { id: charge.parcel_id } });
      if (parcel?.recipient_id) {
        await manager.getRepository(NotificationEntity).save(manager.getRepository(NotificationEntity).create({
          user_id: parcel.recipient_id,
          category: 'NETWORK_ENTRY_PAYMENT_REJECTED',
          title: 'رسید پرداخت نیاز به اصلاح دارد',
          body: `رسید هزینه ورود به شبکه تأیید نشد: ${reason.trim()} لطفاً رسید معتبر دیگری ثبت کنید.`,
          reference_type: 'network_entry_charge',
          reference_id: charge.id,
        }));
      }
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: actor.role,
        entity_type: 'network_entry_charge',
        entity_id: charge.id,
        action: 'NETWORK_ENTRY_RECEIPT_REJECTED',
        old_state: { status: NetworkEntryChargeStatus.RECEIPT_SUBMITTED },
        new_state: { status: NetworkEntryChargeStatus.REJECTED, reason: reason.trim() },
        transaction_id: charge.id,
        correlation_id: `network-entry-charge:${charge.id}`,
        metadata: { parcelId: charge.parcel_id },
      }));
      return { charge: saved, rejected: true };
    });
  }

  async verifyNetworkEntryPayment(chargeId: string, providerReference: string, actor: UserPayload) {
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(actor.role)) {
      throw new ForbiddenException('Only an administrator can reconcile an externally verified entry-fee payment');
    }
    if (typeof providerReference !== 'string' || !providerReference.trim() || providerReference.length > 160) {
      throw new BadRequestException('An independently verified bank/provider reference is required');
    }

    return this.dataSource.transaction(async (manager) => {
      const charges = manager.getRepository(NetworkEntryChargeEntity);
      const charge = await charges.findOne({ where: { id: chargeId } });
      if (!charge) throw new NotFoundException('Network-entry charge not found');
      if (charge.status === NetworkEntryChargeStatus.VERIFIED) {
        if (charge.provider_reference === providerReference.trim()) return { charge, alreadyVerified: true };
        throw new ConflictException('Charge was verified with a different provider reference');
      }
      if (charge.status !== NetworkEntryChargeStatus.RECEIPT_SUBMITTED || !charge.receipt_evidence_ref) {
        throw new ConflictException('A recipient receipt must be submitted before payment reconciliation');
      }
      const duplicate = await charges.findOne({ where: { provider_reference: providerReference.trim() } });
      if (duplicate && duplicate.id !== charge.id) throw new ConflictException('Provider reference has already been used');

      const parcel = await manager.getRepository(ParcelEntity).findOne({ where: { id: charge.parcel_id } });
      if (!parcel) throw new NotFoundException('Linked parcel not found');
      const now = new Date();
      charge.status = NetworkEntryChargeStatus.VERIFIED;
      charge.provider_reference = providerReference.trim();
      charge.verified_by = actor.sub;
      charge.verified_at = now;
      const saved = await charges.save(charge);
      const notifications = manager.getRepository(NotificationEntity);
      for (const userId of [parcel.recipient_id, parcel.courier_id].filter((value): value is string => Boolean(value))) {
        await notifications.save(notifications.create({
          user_id: userId,
          category: 'NETWORK_ENTRY_PAYMENT_VERIFIED',
          title: 'پرداخت هزینه ورود به شبکه تأیید شد',
          body: 'پرداخت هزینه ورود مرسوله به شبکه Pudo-N ثبت شد. اکنون گیرنده می‌تواند هاب موردنظر را انتخاب کند.',
          reference_type: 'network_entry_charge',
          reference_id: charge.id,
        }));
      }
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: actor.role,
        entity_type: 'network_entry_charge',
        entity_id: charge.id,
        action: 'NETWORK_ENTRY_PAYMENT_RECONCILED',
        old_state: { status: NetworkEntryChargeStatus.RECEIPT_SUBMITTED },
        new_state: { status: NetworkEntryChargeStatus.VERIFIED, verifiedAt: now.toISOString(), providerReference: providerReference.trim() },
        transaction_id: charge.id,
        correlation_id: `network-entry-charge:${charge.id}`,
        metadata: { parcelId: parcel.id, amount: charge.amount, currencyUnit: 'TOMAN', verificationMode: 'ADMIN_RECONCILIATION' },
      }));
      return { charge: saved, alreadyVerified: false, hubSelectionEnabled: true };
    });
  }

  private async allocateNetworkEntryRevenue(manager: any, charge: NetworkEntryChargeEntity, parcel: ParcelEntity, hub: HubEntity, actorId: string) {
    const allocations = manager.getRepository(RevenueAllocationEntity);
    const existing = await allocations.findOne({
      where: { charge_type: 'NETWORK_ENTRY', network_entry_charge_id: charge.id, beneficiary_type: RevenueBeneficiaryType.COURIER },
    });
    if (existing) return;

    if (!parcel.courier_id || !hub.owner_id) throw new ConflictException('Courier and hub owner are required for revenue allocation');
    const total = Number(charge.amount);
    if (!Number.isSafeInteger(total) || total < 0) throw new ConflictException('Network-entry charge amount is invalid');
    const courierShare = Math.floor(total * 30 / 100);
    const hubShare = Math.floor(total * 30 / 100);
    const platformShare = total - courierShare - hubShare;
    const snapshot = {
      snapshotVersion: 2,
      allocationStatus: 'ALLOCATED_30_30_40',
      chargeType: 'NETWORK_ENTRY',
      chargeId: charge.id,
      parcelId: parcel.id,
      postalPostageAmount: charge.postal_postage_amount,
      entryFeePercent: Number(charge.fee_percent),
      basisAmount: total,
      currencyUnit: 'TOMAN',
      shares: {
        courier: { percent: 30, amount: courierShare },
        hub: { percent: 30, amount: hubShare },
        platform: { percent: 40, amount: platformShare },
      },
      rounding: 'FLOOR_COURIER_AND_HUB_REMAINDER_TO_PLATFORM',
      sumCheck: courierShare + hubShare + platformShare,
      capturedAt: new Date().toISOString(),
    };
    const split = [
      { type: RevenueBeneficiaryType.COURIER, userId: parcel.courier_id, amount: courierShare, percent: 30 },
      { type: RevenueBeneficiaryType.HUB, userId: hub.owner_id, amount: hubShare, percent: 30 },
      { type: RevenueBeneficiaryType.PLATFORM, userId: null, amount: platformShare, percent: 40 },
    ];
    for (const item of split) {
      await allocations.save(allocations.create({
        charge_type: 'NETWORK_ENTRY',
        charge_id: null,
        network_entry_charge_id: charge.id,
        parcel_id: parcel.id,
        beneficiary_type: item.type,
        beneficiary_id: item.userId,
        percentage: item.percent,
        amount: String(item.amount),
        currency_unit: 'TOMAN',
        allocation_snapshot: snapshot,
      }));
      if (item.userId && item.amount > 0) {
        await this.creditRevenueWallet(manager, item.userId, item.amount, charge.id, actorId, item.type);
      }
    }
    await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
      actor_id: actorId,
      actor_role: UserRole.RECIPIENT,
      entity_type: 'network_entry_charge',
      entity_id: charge.id,
      action: 'NETWORK_ENTRY_REVENUE_ALLOCATED',
      old_state: { allocationStatus: 'VERIFIED_PENDING_HUB_SELECTION' },
      new_state: snapshot,
      transaction_id: charge.id,
      correlation_id: `network-entry-allocation:${charge.id}`,
      metadata: { parcelId: parcel.id, hubId: hub.id },
    }));
  }

  private async creditRevenueWallet(manager: any, userId: string, amount: number, chargeId: string, actorId: string, beneficiaryType: RevenueBeneficiaryType) {
    const operationType = `revenue.allocate.entry.${beneficiaryType.toLowerCase()}`;
    const actorScope = `revenue:network-entry:${chargeId}`;
    const idempotencyKey = `network-entry:${chargeId}:${beneficiaryType.toLowerCase()}`;
    const requestHash = createHash('sha256').update(JSON.stringify({ chargeId, userId, amount, operationType })).digest('hex');
    const idemRepo = manager.getRepository(IdempotencyRecordEntity);
    await idemRepo.createQueryBuilder().insert().values({
      actor_scope: actorScope, operation_type: operationType, idempotency_key: idempotencyKey,
      request_hash: requestHash, state: IdempotencyState.IN_PROGRESS,
    }).orIgnore().execute();
    const idem = await idemRepo.findOne({ where: { actor_scope: actorScope, operation_type: operationType, idempotency_key: idempotencyKey } });
    if (!idem || idem.request_hash !== requestHash) throw new ConflictException('Unable to establish entry-fee allocation idempotency record');
    if (idem.state === IdempotencyState.COMPLETED) return;

    const wallets = manager.getRepository(WalletEntity);
    await wallets.createQueryBuilder().insert().values({ user_id: userId }).orIgnore().execute();
    const postgres = manager.connection.options.type === 'postgres';
    const wallet = await wallets.findOne({
      where: { user_id: userId },
      ...(postgres ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!wallet) throw new ConflictException('Unable to load wallet for entry-fee allocation');
    const balance = Number(wallet.balance) + amount;
    const totalEarned = Number(wallet.total_earned) + amount;
    if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(totalEarned) || balance > 2_147_483_647 || totalEarned > 2_147_483_647) {
      throw new ConflictException('Entry-fee allocation exceeds wallet limits');
    }
    wallet.balance = balance;
    wallet.total_earned = totalEarned;
    await wallets.save(wallet);
    const ledger = manager.getRepository(WalletTransactionEntity);
    await ledger.save(ledger.create({
      wallet_id: wallet.id,
      actor_id: actorId,
      idempotency_record_id: idem.id,
      transaction_type: WalletTransactionType.EARNING_CREDIT,
      bucket: WalletBucket.AVAILABLE,
      amount: String(amount),
      bucket_balance_after: String(balance),
      currency_unit: 'TOMAN',
      reference_type: 'network_entry_charge',
      reference_id: chargeId,
      description: `Pudo-N network-entry ${beneficiaryType.toLowerCase()} share`,
    }));
    idem.state = IdempotencyState.COMPLETED;
    idem.response_status = 200;
    idem.response_body = { chargeId, userId, amount, balance };
    idem.completed_at = new Date();
    await idemRepo.save(idem);
  }

  async requestPudo(parcelId: string, hubId: string, actor: UserPayload) {
    if (actor.role !== UserRole.RECIPIENT) {
      throw new ForbiddenException('Only the parcel recipient can request PUDO');
    }
    if (!hubId || typeof hubId !== 'string') throw new BadRequestException('hubId is required');

    return this.dataSource.transaction(async (manager) => {
      const parcels = manager.getRepository(ParcelEntity);
      const hubs = manager.getRepository(HubEntity);
      const parcel = await this.findParcelForUpdate(manager, parcelId);
      if (!parcel) throw new NotFoundException('Parcel not found');
      if (parcel.recipient_id !== actor.sub && parcel.recipient_phone !== actor.phone) {
        throw new ForbiddenException('Only the parcel recipient can request PUDO for this parcel');
      }

      const entryCharge = await manager.getRepository(NetworkEntryChargeEntity).findOne({ where: { parcel_id: parcel.id } });
      if (!entryCharge || entryCharge.status !== NetworkEntryChargeStatus.VERIFIED) {
        throw new ConflictException('Network-entry payment must be verified before selecting a hub');
      }

      const hub = await hubs.findOne({ where: { id: hubId } });
      if (!hub || !hub.is_active || hub.is_temporarily_closed) {
        throw new BadRequestException('Selected hub does not exist or is not accepting parcels');
      }
      if (parcel.status === ParcelStatus.HUB_SELECTED && parcel.proposed_hub_id === hub.id) return parcel;
      if (parcel.status !== ParcelStatus.DELIVERY_ATTEMPT) {
        throw new ConflictException('Parcel is not awaiting a recipient PUDO request');
      }

      let nextStatus: ParcelStatus = parcel.status;
      for (const status of [ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.PUDO_ELIGIBILITY, ParcelStatus.HUB_SELECTED]) {
        if (!canTransitionParcel(nextStatus, status)) {
          throw new ConflictException(`Invalid PUDO request transition from ${nextStatus} to ${status}`);
        }
        nextStatus = status;
      }
      const oldStatus = parcel.status;
      parcel.proposed_hub_id = hub.id;
      parcel.status = nextStatus;
      await this.allocateNetworkEntryRevenue(manager, entryCharge, parcel, hub, actor.sub);
      parcel.updated_at = new Date();
      const saved = await parcels.save(parcel);
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: actor.role,
        entity_type: 'parcel',
        entity_id: parcel.id,
        action: 'PARCEL_PUDO_HUB_SELECTED',
        old_state: { status: oldStatus, proposedHubId: null },
        new_state: { status: nextStatus, proposedHubId: hub.id },
        transaction_id: parcel.id,
        correlation_id: `parcel-stage:${parcel.id}:${nextStatus}`,
        metadata: { stage: 'PUDO_HUB_SELECTION' },
      }));
      return saved;
    });
  }

  /**
   * The hub owner confirms physical custody. The parcel row is locked so retries
   * cannot create duplicate invoices or race a second custody confirmation.
   */
  async confirmCourierHandover(parcelId: string, evidenceRef: string, actor: UserPayload) {
    return this.recordCustodyEvidence(parcelId, evidenceRef, actor, 'COURIER');
  }

  async confirmHubReceipt(parcelId: string, actor: UserPayload, evidenceRef: string) {
    return this.recordCustodyEvidence(parcelId, evidenceRef, actor, 'HUB');
  }

  private async recordCustodyEvidence(
    parcelId: string,
    evidenceRef: string,
    actor: UserPayload,
    party: 'COURIER' | 'HUB',
  ) {
    if (party === 'COURIER' && actor.role !== UserRole.COURIER) {
      throw new ForbiddenException('Only the assigned courier can confirm handover');
    }
    if (party === 'HUB' && actor.role !== UserRole.HUB_OWNER) {
      throw new ForbiddenException('Only the assigned hub owner can confirm receipt');
    }
    if (typeof evidenceRef !== 'string' || evidenceRef.length < 8 || evidenceRef.length > 512 ||
        /^https?:\/\//i.test(evidenceRef) || evidenceRef.includes('..')) {
      throw new BadRequestException('A private object-storage evidence reference is required; public URLs are not accepted');
    }

    return this.dataSource.transaction(async (manager) => {
      const parcels = manager.getRepository(ParcelEntity);
      const parcel = await this.findParcelForUpdate(manager, parcelId);
      if (!parcel) throw new NotFoundException('Parcel not found');

      const hub = parcel.proposed_hub_id
        ? await manager.getRepository(HubEntity).findOne({ where: { id: parcel.proposed_hub_id } })
        : null;
      if (!hub) throw new ConflictException('Parcel must have an assigned hub before custody evidence is recorded');
      if (party === 'COURIER' && parcel.courier_id !== actor.sub) {
        throw new ForbiddenException('Only the courier assigned to this parcel can confirm handover');
      }
      if (party === 'HUB' && hub.owner_id !== actor.sub) {
        throw new ForbiddenException('Only the owner of the assigned hub can confirm receipt');
      }
      if (parcel.current_hub_id === hub.id && parcel.delivered_to_hub_at) {
        return { parcel, custodyConfirmed: true, alreadyConfirmed: true, invoice: null, invoiceDeferredUntilCollectionRequest: true };
      }
      if (![ParcelStatus.HUB_SELECTED, ParcelStatus.HANDOVER_IN_PROGRESS, ParcelStatus.TRANSFERRED_TO_HUB].includes(parcel.status)) {
        throw new ConflictException('Parcel is not in a state that permits hub handover evidence');
      }

      const now = new Date();
      if (party === 'COURIER') {
        if (parcel.courier_handover_evidence_ref) {
          if (parcel.courier_handover_evidence_ref !== evidenceRef) {
            throw new ConflictException('Courier handover evidence has already been submitted');
          }
        } else {
          parcel.courier_handover_evidence_ref = evidenceRef;
          parcel.courier_handover_at = now;
        }
      } else {
        if (parcel.hub_receipt_evidence_ref) {
          if (parcel.hub_receipt_evidence_ref !== evidenceRef) {
            throw new ConflictException('Hub receipt evidence has already been submitted');
          }
        } else {
          parcel.hub_receipt_evidence_ref = evidenceRef;
          parcel.hub_receipt_confirmed_at = now;
        }
      }

      const oldStatus = parcel.status;
      if (parcel.status === ParcelStatus.HUB_SELECTED && canTransitionParcel(parcel.status, ParcelStatus.HANDOVER_IN_PROGRESS)) {
        parcel.status = ParcelStatus.HANDOVER_IN_PROGRESS;
      }
      const bothConfirmed = Boolean(parcel.courier_handover_evidence_ref && parcel.hub_receipt_evidence_ref);
      if (bothConfirmed && !parcel.current_hub_id) {
        if (parcel.status === ParcelStatus.HANDOVER_IN_PROGRESS) {
          if (!canTransitionParcel(parcel.status, ParcelStatus.TRANSFERRED_TO_HUB)) {
            throw new ConflictException('Invalid transition after dual custody confirmation');
          }
          parcel.status = ParcelStatus.TRANSFERRED_TO_HUB;
        }
        if (parcel.status === ParcelStatus.TRANSFERRED_TO_HUB) {
          if (!canTransitionParcel(parcel.status, ParcelStatus.STORED_AT_HUB)) {
            throw new ConflictException('Invalid transition into hub storage');
          }
          parcel.status = ParcelStatus.STORED_AT_HUB;
        }
        parcel.current_hub_id = hub.id;
        parcel.delivered_to_hub_at = now;
      }
      parcel.updated_at = now;
      const savedParcel = await parcels.save(parcel);

      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: actor.role,
        entity_type: 'parcel',
        entity_id: parcel.id,
        action: party === 'COURIER' ? 'PARCEL_COURIER_HANDOVER_EVIDENCE_SUBMITTED' : 'PARCEL_HUB_RECEIPT_EVIDENCE_SUBMITTED',
        old_state: { status: oldStatus },
        new_state: {
          status: savedParcel.status,
          party,
          evidenceRef,
          courierConfirmed: Boolean(savedParcel.courier_handover_evidence_ref),
          hubConfirmed: Boolean(savedParcel.hub_receipt_evidence_ref),
          custodyConfirmed: bothConfirmed,
        },
        transaction_id: parcel.id,
        correlation_id: `parcel-stage:${parcel.id}:CUSTODY_EVIDENCE`,
        metadata: { stage: party === 'COURIER' ? 'COURIER_HANDOVER' : 'HUB_RECEIPT', hubId: hub.id },
      }));

      if (bothConfirmed) {
        await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
          actor_id: actor.sub,
          actor_role: actor.role,
          entity_type: 'parcel',
          entity_id: parcel.id,
          action: 'PARCEL_HUB_CUSTODY_CONFIRMED',
          old_state: { status: oldStatus, currentHubId: null },
          new_state: {
            status: ParcelStatus.STORED_AT_HUB,
            currentHubId: hub.id,
            receivedAt: parcel.delivered_to_hub_at?.toISOString(),
            courierEvidenceRef: parcel.courier_handover_evidence_ref,
            hubEvidenceRef: parcel.hub_receipt_evidence_ref,
          },
          transaction_id: parcel.id,
          correlation_id: `parcel-stage:${parcel.id}:HUB_RECEIVED`,
          metadata: { stage: 'HUB_RECEIPT', hubId: hub.id, dualConfirmation: true },
        }));
      }

      return {
        parcel: savedParcel,
        custodyConfirmed: bothConfirmed,
        awaitingConfirmation: !bothConfirmed,
        awaitingParty: bothConfirmed ? null : party === 'COURIER' ? 'HUB' : 'COURIER',
        invoice: null,
        invoiceDeferredUntilCollectionRequest: bothConfirmed,
      };
    });
  }

  async requestCustomerCollection(parcelId: string, actor: UserPayload) {
    if (actor.role !== UserRole.RECIPIENT) throw new ForbiddenException('Only the parcel recipient can request collection');

    return this.dataSource.transaction(async (manager) => {
      const parcels = manager.getRepository(ParcelEntity);
      const parcel = await this.findParcelForUpdate(manager, parcelId);
      if (!parcel) throw new NotFoundException('Parcel not found');
      if (parcel.recipient_id !== actor.sub && parcel.recipient_phone !== actor.phone) {
        throw new ForbiddenException('Only the parcel recipient can request collection');
      }
      if (!parcel.current_hub_id || !parcel.delivered_to_hub_at) {
        throw new ConflictException('Parcel has not been received into hub custody');
      }

      const invoices = manager.getRepository(InvoiceEntity);
      const existingInvoice = await invoices.findOne({ where: { parcel_id: parcel.id } });
      if (existingInvoice) {
        if (parcel.status === ParcelStatus.STORED_AT_HUB && canTransitionParcel(parcel.status, ParcelStatus.READY_FOR_CUSTOMER)) {
          const previousStatus = parcel.status;
          parcel.status = ParcelStatus.READY_FOR_CUSTOMER;
          parcel.updated_at = new Date();
          await parcels.save(parcel);
          await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
            actor_id: actor.sub,
            actor_role: actor.role,
            entity_type: 'parcel',
            entity_id: parcel.id,
            action: 'PARCEL_READY_FOR_CUSTOMER',
            old_state: { status: previousStatus },
            new_state: { status: ParcelStatus.READY_FOR_CUSTOMER },
            transaction_id: parcel.id,
            correlation_id: `parcel-stage:${parcel.id}:READY_FOR_CUSTOMER`,
            metadata: { stage: 'CUSTOMER_COLLECTION_REQUESTED', existingInvoice: true },
          }));
        }
        return { parcel, invoice: existingInvoice, alreadyIssued: true };
      }

      if (parcel.status === ParcelStatus.STORED_AT_HUB) {
        if (!canTransitionParcel(parcel.status, ParcelStatus.READY_FOR_CUSTOMER)) {
          throw new ConflictException('Parcel cannot be prepared for customer collection');
        }
        const previousStatus = parcel.status;
        parcel.status = ParcelStatus.READY_FOR_CUSTOMER;
        parcel.updated_at = new Date();
        await parcels.save(parcel);
        await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
          actor_id: actor.sub,
          actor_role: actor.role,
          entity_type: 'parcel',
          entity_id: parcel.id,
          action: 'PARCEL_READY_FOR_CUSTOMER',
          old_state: { status: previousStatus },
          new_state: { status: ParcelStatus.READY_FOR_CUSTOMER },
          transaction_id: parcel.id,
          correlation_id: `parcel-stage:${parcel.id}:READY_FOR_CUSTOMER`,
          metadata: { stage: 'CUSTOMER_COLLECTION_REQUESTED' },
        }));
      } else if (parcel.status !== ParcelStatus.READY_FOR_CUSTOMER) {
        throw new ConflictException('Parcel is not ready for customer collection');
      }

      const pricing = await this.pricingService.calculateWithActiveTariff(parcel, new Date());
      if (pricing.isExpired) {
        parcel.status = ParcelStatus.STORED_AT_HUB;
        parcel.expired_at = parcel.expired_at ?? new Date();
        parcel.updated_at = new Date();
        await parcels.save(parcel);
        await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
          actor_id: actor.sub,
          actor_role: actor.role,
          entity_type: 'parcel',
          entity_id: parcel.id,
          action: 'PARCEL_STORAGE_EXPIRED',
          old_state: { status: ParcelStatus.READY_FOR_CUSTOMER },
          new_state: { status: ParcelStatus.STORED_AT_HUB, expiredAt: parcel.expired_at.toISOString() },
          transaction_id: parcel.id,
          correlation_id: `parcel-expired:${parcel.id}`,
          metadata: { reason: 'STORAGE_LIMIT_REACHED', tariffVersionId: parcel.tariff_version_id ?? null },
        }));
        return { parcel, invoice: null, expired: true, reason: 'STORAGE_LIMIT_REACHED' };
      }
      const invoice = await this.invoicesService.create(parcel, pricing, manager);
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: actor.role,
        entity_type: 'invoice',
        entity_id: invoice.id,
        action: 'INVOICE_TARIFF_SNAPSHOT_CREATED',
        old_state: null,
        new_state: {
          invoiceStatus: invoice.status,
          tariffVersionId: invoice.tariff_version_id ?? pricing.tariffVersionId ?? null,
          tariffSnapshot: invoice.tariff_snapshot ?? pricing.tariffSnapshot,
          hubShareSnapshot: invoice.hub_share_snapshot ?? null,
          basePostCost: invoice.base_post_cost,
          elapsedHours: invoice.elapsed_hours,
          feePercentage: invoice.fee_percentage,
          calculatedFee: invoice.calculated_fee,
          totalAmount: invoice.total_amount,
        },
        transaction_id: invoice.id,
        correlation_id: `tariff-snapshot:${invoice.id}`,
        metadata: { parcelId: parcel.id, snapshotPolicy: 'immutable-invoice-snapshot' },
      }));
      return { parcel, invoice, alreadyIssued: false };
    });
  }

  private async findParcelForUpdate(manager: any, parcelId: string) {
    const repository = manager.getRepository(ParcelEntity);
    return repository.findOne({
      where: { id: parcelId },
      ...(manager.connection?.options?.type === 'postgres'
        ? { lock: { mode: 'pessimistic_write' as const } }
        : {}),
    });
  }

  private hashDeliveryCode(code: string, salt: string) {
    return createHash('sha256').update(`${salt}:${code}`).digest('hex');
  }

  /** Issues a short-lived HUB_TO_RECIPIENT custody code to the registered phone. */
  async requestDeliveryCode(parcelId: string, actor: UserPayload) {
    if (actor.role !== UserRole.RECIPIENT) throw new ForbiddenException('Only the parcel recipient can request a delivery code');
    const parcel = await this.repo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    if (parcel.recipient_id !== actor.sub || parcel.recipient_phone !== actor.phone) {
      throw new ForbiddenException('Only the registered recipient can request a delivery code');
    }
    if (parcel.status !== ParcelStatus.READY_FOR_CUSTOMER) {
      throw new ConflictException('Parcel is not ready for customer collection');
    }
    const invoice = await this.dataSource.getRepository(InvoiceEntity).findOne({ where: { parcel_id: parcel.id } });
    if (!invoice || invoice.status !== PaymentStatus.PAID) {
      throw new ConflictException('Invoice must be PAID before requesting a delivery code');
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    const requestedAt = new Date();
    const expiresAt = new Date(requestedAt.getTime() + DELIVERY_CODE_TTL_MS);
    const transfer = await this.dataSource.transaction(async (manager) => {
      const lockedParcel = await this.findParcelForUpdate(manager, parcelId);
      if (!lockedParcel || lockedParcel.recipient_id !== actor.sub ||
          lockedParcel.status !== ParcelStatus.READY_FOR_CUSTOMER || lockedParcel.current_hub_id == null) {
        throw new ConflictException('Parcel eligibility changed; request a new delivery code');
      }
      const transfers = manager.getRepository(CustodyTransferEntity);
      const latest = await transfers.findOne({
        where: {
          parcel_id: parcelId,
          transfer_type: CustodyTransferType.HUB_TO_RECIPIENT,
          receiver_id: actor.sub,
        },
        order: { created_at: 'DESC' },
      });
      if (latest && requestedAt.getTime() - new Date(latest.created_at).getTime() < 60_000) {
        throw new ConflictException('Please wait before requesting another delivery code');
      }
      await transfers.update(
        { parcel_id: parcelId, transfer_type: CustodyTransferType.HUB_TO_RECIPIENT, status: CustodyTransferStatus.PENDING },
        { status: CustodyTransferStatus.EXPIRED, failure_reason: 'Superseded by a newer delivery-code request' },
      );
      const transfer = await transfers.save(transfers.create({
        parcel_id: parcelId,
        from_hub_id: lockedParcel.current_hub_id,
        receiver_id: lockedParcel.recipient_id,
        transfer_type: CustodyTransferType.HUB_TO_RECIPIENT,
        status: CustodyTransferStatus.PENDING,
        code_salt: salt,
        code_hash: this.hashDeliveryCode(code, salt),
        expires_at: expiresAt,
        failed_attempts: 0,
      }));
      await manager.getRepository(NotificationEntity).save(manager.getRepository(NotificationEntity).create({
        user_id: actor.sub,
        category: 'DELIVERY_CODE',
        title: 'کد تحویل مرسوله',
        body: `کد یک‌بارمصرف تحویل مرسوله ${lockedParcel.tracking_code} برابر ${code} است. این کد تا یک ساعت معتبر است و فقط یک‌بار استفاده می‌شود. کد را فقط هنگام تحویل واقعی مرسوله در اختیار هاب‌دار قرار دهید.`,
        reference_type: 'custody_transfer',
        reference_id: transfer.id,
        expires_at: expiresAt,
      }));
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: actor.role,
        entity_type: 'custody_transfer',
        entity_id: transfer.id,
        action: 'DELIVERY_CODE_NOTIFIED_IN_APP',
        old_state: null,
        new_state: { status: CustodyTransferStatus.PENDING, expiresAt: expiresAt.toISOString(), deliveryChannel: 'IN_APP' },
        transaction_id: transfer.id,
        correlation_id: `delivery-code:${transfer.id}`,
        metadata: { parcelId: lockedParcel.id, recipientId: actor.sub, channel: 'IN_APP' },
      }));
      return transfer;
    });
    return { parcelId: parcel.id, transferId: transfer.id, sent: true, expiresAt: expiresAt.toISOString(), channel: 'IN_APP' };
  }

  /**
   * Release is gated by a paid invoice and a valid one-time HUB_TO_RECIPIENT custody
   * transfer. Parcel and transfer locks serialize concurrent verification attempts.
   */
  async confirmCustomerRelease(parcelId: string, actor: UserPayload, code: string, evidenceRef: string, nationalId?: string) {
    if (actor.role !== UserRole.HUB_OWNER) throw new ForbiddenException('Only the assigned hub owner can verify the collection code');
    if (!/^\d{6}$/.test(String(code || ''))) throw new BadRequestException('A six-digit delivery code is required');
    if (nationalId && !/^\d{10}$/.test(nationalId)) throw new BadRequestException('National ID must contain 10 digits');
    if (typeof evidenceRef !== 'string' || evidenceRef.length < 8 || evidenceRef.length > 512 ||
        /^https?:\/\//i.test(evidenceRef) || evidenceRef.includes('..')) {
      throw new BadRequestException('A private object-storage evidence reference is required; public URLs are not accepted');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const parcel = await this.findParcelForUpdate(manager, parcelId);
      if (!parcel) throw new NotFoundException('Parcel not found');
      const hub = parcel.current_hub_id
        ? await manager.getRepository(HubEntity).findOne({ where: { id: parcel.current_hub_id, owner_id: actor.sub } })
        : null;
      if (!hub) throw new ForbiddenException('Parcel is not stored at a hub owned by this user');
      if (parcel.status !== ParcelStatus.READY_FOR_CUSTOMER) {
        throw new ConflictException('Parcel must be ready for customer collection before release');
      }
      const invoice = await manager.getRepository(InvoiceEntity).findOne({ where: { parcel_id: parcel.id } });
      if (!invoice || invoice.status !== PaymentStatus.PAID) {
        throw new ConflictException('Invoice must be PAID before physical parcel release');
      }

      const transfers = manager.getRepository(CustodyTransferEntity);
      const transfer = await transfers.findOne({
        where: {
          parcel_id: parcel.id,
          transfer_type: CustodyTransferType.HUB_TO_RECIPIENT,
          receiver_id: parcel.recipient_id,
          status: CustodyTransferStatus.PENDING,
        },
        order: { created_at: 'DESC' },
        ...(manager.connection.options.type === 'postgres' ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      if (!transfer) return { invalidCode: true, codeUnavailable: true };
      if (transfer.code_verified_at) throw new ConflictException('This delivery code has already been verified');
      if (transfer.expires_at.getTime() <= Date.now()) {
        transfer.status = CustodyTransferStatus.EXPIRED;
        transfer.failure_reason = 'Delivery code expired';
        await transfers.save(transfer);
        return { invalidCode: true, codeExpired: true };
      }

      const expected = Buffer.from(transfer.code_hash, 'hex');
      const supplied = Buffer.from(this.hashDeliveryCode(code, transfer.code_salt), 'hex');
      const matches = expected.length === supplied.length && timingSafeEqual(expected, supplied);
      if (!matches) {
        transfer.failed_attempts = (transfer.failed_attempts ?? 0) + 1;
        if (transfer.failed_attempts >= 5) {
          transfer.status = CustodyTransferStatus.EXPIRED;
          transfer.failure_reason = 'Maximum delivery-code attempts exceeded';
        }
        await transfers.save(transfer);
        return { invalidCode: true, attemptsRemaining: Math.max(0, 5 - transfer.failed_attempts) };
      }

      if (nationalId) {
        const recipient = parcel.recipient_id
          ? await manager.getRepository(UserEntity).findOne({ where: { id: parcel.recipient_id } })
          : null;
        if (recipient?.national_id && recipient.national_id !== nationalId) return { nationalIdMismatch: true };
      }

      const now = new Date();
      transfer.code_verified_at = now;
      transfer.hub_handover_evidence_ref = evidenceRef;
      await transfers.save(transfer);
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: actor.role,
        entity_type: 'custody_transfer',
        entity_id: transfer.id,
        action: 'DELIVERY_CODE_VERIFIED_HUB_EVIDENCE_PENDING',
        old_state: { status: transfer.status, codeVerifiedAt: null },
        new_state: { status: transfer.status, codeVerifiedAt: now.toISOString(), hubEvidenceRef: evidenceRef },
        transaction_id: transfer.id,
        correlation_id: `delivery-code-verified:${transfer.id}`,
        metadata: { parcelId: parcel.id, invoiceId: invoice.id, awaitsRecipientEvidence: true },
      }));
      await manager.getRepository(NotificationEntity).save(manager.getRepository(NotificationEntity).create({
        user_id: parcel.recipient_id,
        category: 'FINAL_HANDOVER_EVIDENCE_REQUIRED',
        title: 'تأیید نهایی تحویل مرسوله',
        body: 'هاب کد یک‌بارمصرف را تأیید کرده است. برای تکمیل تحویل، تأیید نهایی و مدرک تصویری را در پنل خود ثبت کنید.',
        reference_type: 'custody_transfer',
        reference_id: transfer.id,
      }));
      return {
        verified: true,
        awaitingRecipientEvidence: true,
        parcelId: parcel.id,
        invoiceId: invoice.id,
        custodyTransferId: transfer.id,
        codeVerifiedAt: now.toISOString(),
      };
    });

    if ('invalidCode' in result) {
      if ('codeExpired' in result) throw new UnauthorizedException('Delivery code expired; request a new code');
      if ('codeUnavailable' in result) throw new UnauthorizedException('No active delivery code; request one first');
      throw new UnauthorizedException(`Invalid delivery code; attempts remaining: ${result.attemptsRemaining}`);
    }
    if ('nationalIdMismatch' in result) throw new ForbiddenException('National ID does not match the registered recipient');
    return result;
  }

  async confirmRecipientHandover(parcelId: string, evidenceRef: string, actor: UserPayload) {
    if (actor.role !== UserRole.RECIPIENT) throw new ForbiddenException('Only the recipient can confirm final handover');
    if (typeof evidenceRef !== 'string' || evidenceRef.length < 8 || evidenceRef.length > 512 ||
        /^https?:\/\//i.test(evidenceRef) || evidenceRef.includes('..')) {
      throw new BadRequestException('A private object-storage evidence reference is required; public URLs are not accepted');
    }

    return this.dataSource.transaction(async (manager) => {
      const parcel = await this.findParcelForUpdate(manager, parcelId);
      if (!parcel) throw new NotFoundException('Parcel not found');
      if (parcel.recipient_id !== actor.sub && parcel.recipient_phone !== actor.phone) {
        throw new ForbiddenException('Only the registered recipient can confirm final handover');
      }
      const transfers = manager.getRepository(CustodyTransferEntity);
      if (parcel.status === ParcelStatus.COLLECTED && parcel.collected_at) {
        const completedTransfer = await transfers.findOne({
          where: { parcel_id: parcel.id, transfer_type: CustodyTransferType.HUB_TO_RECIPIENT, receiver_id: actor.sub, status: CustodyTransferStatus.CONFIRMED },
          order: { created_at: 'DESC' },
        });
        if (completedTransfer?.recipient_handover_evidence_ref === evidenceRef) {
          return { parcel, transfer: completedTransfer, alreadyConfirmed: true, collectedAt: parcel.collected_at.toISOString() };
        }
        throw new ConflictException('Parcel final handover has already been completed');
      }
      if (parcel.status !== ParcelStatus.READY_FOR_CUSTOMER) {
        throw new ConflictException('Parcel is not awaiting final customer handover');
      }
      const invoice = await manager.getRepository(InvoiceEntity).findOne({ where: { parcel_id: parcel.id } });
      if (!invoice || invoice.status !== PaymentStatus.PAID) throw new ConflictException('Invoice must be PAID before final handover');

      const transfer = await transfers.findOne({
        where: {
          parcel_id: parcel.id,
          transfer_type: CustodyTransferType.HUB_TO_RECIPIENT,
          receiver_id: actor.sub,
          status: CustodyTransferStatus.PENDING,
        },
        order: { created_at: 'DESC' },
        ...(manager.connection.options.type === 'postgres' ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      if (!transfer || !transfer.code_verified_at || !transfer.hub_handover_evidence_ref) {
        throw new ConflictException('Hub must verify the one-time code and submit handover evidence first');
      }
      if (transfer.recipient_handover_evidence_ref) {
        if (transfer.recipient_handover_evidence_ref === evidenceRef) {
          return { parcel, transfer, alreadyConfirmed: parcel.status === ParcelStatus.COLLECTED };
        }
        throw new ConflictException('Recipient handover evidence has already been submitted');
      }

      const now = new Date();
      const oldStatus = parcel.status;
      if (!canTransitionParcel(parcel.status, ParcelStatus.CUSTOMER_COLLECTION) ||
          !canTransitionParcel(ParcelStatus.CUSTOMER_COLLECTION, ParcelStatus.COLLECTED)) {
        throw new ConflictException('Invalid final handover state transition');
      }
      parcel.status = ParcelStatus.COLLECTED;
      parcel.collected_at = now;
      parcel.updated_at = now;
      transfer.recipient_handover_evidence_ref = evidenceRef;
      transfer.recipient_handover_at = now;
      transfer.status = CustodyTransferStatus.CONFIRMED;
      transfer.consumed_at = now;
      transfer.completed_at = now;
      const savedParcel = await manager.getRepository(ParcelEntity).save(parcel);
      const savedTransfer = await transfers.save(transfer);
      await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
        actor_id: actor.sub,
        actor_role: actor.role,
        entity_type: 'parcel',
        entity_id: parcel.id,
        action: 'PARCEL_FINAL_HANDOVER_CONFIRMED',
        old_state: { status: oldStatus },
        new_state: {
          status: ParcelStatus.COLLECTED,
          collectedAt: now.toISOString(),
          codeVerifiedAt: transfer.code_verified_at?.toISOString(),
          hubEvidenceRef: transfer.hub_handover_evidence_ref,
          recipientEvidenceRef: evidenceRef,
        },
        transaction_id: transfer.id,
        correlation_id: `parcel-final-handover:${parcel.id}`,
        metadata: { invoiceId: invoice.id, custodyTransferId: transfer.id, dualPhotoConfirmation: true },
      }));
      return { parcel: savedParcel, transfer: savedTransfer, alreadyConfirmed: false, collectedAt: now.toISOString() };
    });
  }

  async getById(id: string, requester: UserPayload) {
    const parcel = await this.repo.findOne({ where: { id } });
    if (!parcel) throw new NotFoundException('Parcel not found');

    const isAdministrator = requester.role === UserRole.ADMIN || requester.role === UserRole.SUPER_ADMIN;
    const isAssignedCourier = parcel.courier_id === requester.sub;
    const isRecipient = parcel.recipient_id === requester.sub || parcel.recipient_phone === requester.phone;
    const assignedHubId = parcel.current_hub_id || parcel.proposed_hub_id;
    const isAssignedHubOwner = requester.role === UserRole.HUB_OWNER && Boolean(assignedHubId) &&
      Boolean(await this.hubs.findOne({ where: { id: assignedHubId, owner_id: requester.sub } }));
    if (!isAdministrator && !isAssignedCourier && !isRecipient && !isAssignedHubOwner) {
      throw new ForbiddenException('You do not have access to this parcel');
    }
    return parcel;
  }
}
