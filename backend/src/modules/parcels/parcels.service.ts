import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { ParcelInvitationEntity, ParcelInvitationStatus } from '../../database/entities/parcel-invitation.entity';
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

    const proposedHub = await this.hubs.findOne({ where: { id: dto.proposed_hub_id } });
    if (!proposedHub || !proposedHub.is_active || proposedHub.is_temporarily_closed) {
      throw new BadRequestException('Proposed hub does not exist or is not accepting parcels');
    }

    if (!dto.invitation_id) throw new BadRequestException('An accepted recipient invitation is required before parcel registration');

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
        await manager.getRepository(AuditLogEntity).save(manager.getRepository(AuditLogEntity).create({
          actor_id: courierId,
          actor_role: UserRole.COURIER,
          entity_type: 'parcel',
          entity_id: parcel.id,
          action: 'PARCEL_CREATED_TARIFF_PINNED',
          old_state: null,
          new_state: {
            status: parcel.status,
            tariffVersionId: basePrice.tariffVersionId,
            tariffKey: basePrice.tariffKey,
            packageSize,
            basePostCost: basePrice.basePostCost,
          },
          transaction_id: parcel.id,
          correlation_id: `parcel-create:${parcel.id}`,
          metadata: { source: 'parcel-creation', snapshotPolicy: 'tariff-version-pinned' },
        }));
        return parcel;
      });
    }
    throw new BadRequestException('Transactional persistence is required for consent-gated parcel registration');
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
    if (!isAdministrator && !isAssignedCourier && !isRecipient) {
      throw new ForbiddenException('You do not have access to this parcel');
    }
    return parcel;
  }
}
