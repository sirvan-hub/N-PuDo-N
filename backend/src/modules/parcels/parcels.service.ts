import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { InvoiceEntity, PaymentStatus } from '../../database/entities/invoice.entity';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';
import { ParcelStatus, canTransitionParcel } from './parcel-state-machine';
import { PricingService } from '../pricing/pricing.service';
import { InvoicesService } from '../invoices/invoices.service';

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

  async create(dto: any, courierId: string) {
    const recipient = await this.users.findOne({ where: { phone: dto.recipient_phone } });
    if (!recipient) throw new BadRequestException('Parcel recipient must have a registered user account');

    const proposedHub = await this.hubs.findOne({ where: { id: dto.proposed_hub_id } });
    if (!proposedHub || !proposedHub.is_active || proposedHub.is_temporarily_closed) {
      throw new BadRequestException('Proposed hub does not exist or is not accepting parcels');
    }

    const packageSize = dto.package_size || 'MEDIUM';
    const basePrice = await this.pricingService.resolveBaseCost(packageSize, new Date());
    const parcel = this.repo.create({
      ...dto,
      package_size: packageSize,
      base_post_cost: basePrice.basePostCost,
      tariff_version_id: basePrice.tariffVersionId,
      recipient_id: recipient.id,
      current_hub_id: null,
      courier_id: courierId,
      status: ParcelStatus.DELIVERY_ATTEMPT,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return this.repo.save(parcel);
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
      parcel.proposed_hub_id = hub.id;
      parcel.status = nextStatus;
      parcel.updated_at = new Date();
      return parcels.save(parcel);
    });
  }

  /**
   * The hub owner confirms physical custody. The parcel row is locked so retries
   * cannot create duplicate invoices or race a second custody confirmation.
   */
  async confirmHubReceipt(parcelId: string, actor: UserPayload) {
    if (actor.role !== UserRole.HUB_OWNER) {
      throw new ForbiddenException('Only the owner of the proposed hub can confirm receipt');
    }

    return this.dataSource.transaction(async (manager) => {
      const parcels = manager.getRepository(ParcelEntity);
      const hubs = manager.getRepository(HubEntity);
      const parcel = await this.findParcelForUpdate(manager, parcelId);
      if (!parcel) throw new NotFoundException('Parcel not found');

      const hub = parcel.proposed_hub_id
        ? await hubs.findOne({ where: { id: parcel.proposed_hub_id, owner_id: actor.sub } })
        : null;
      if (!hub) throw new ForbiddenException('Parcel is not assigned to a hub owned by this user');

      if (parcel.current_hub_id === hub.id && parcel.delivered_to_hub_at) {
        return { parcel, invoice: null, alreadyConfirmed: true, invoiceDeferredUntilCollectionRequest: true };
      }
      if (parcel.current_hub_id || parcel.delivered_to_hub_at) {
        throw new ConflictException('Parcel custody has already been recorded');
      }
      if (![ParcelStatus.HUB_SELECTED, ParcelStatus.HANDOVER_IN_PROGRESS, ParcelStatus.TRANSFERRED_TO_HUB].includes(parcel.status)) {
        throw new ConflictException('Parcel is not in a state that permits hub receipt confirmation');
      }

      let nextStatus: ParcelStatus = parcel.status;
      for (const status of [ParcelStatus.HANDOVER_IN_PROGRESS, ParcelStatus.TRANSFERRED_TO_HUB, ParcelStatus.STORED_AT_HUB]) {
        if (nextStatus === status) continue;
        if (!canTransitionParcel(nextStatus, status)) {
          throw new ConflictException(`Invalid custody transition from ${nextStatus} to ${status}`);
        }
        nextStatus = status;
      }

      const receivedAt = new Date();
      parcel.current_hub_id = hub.id;
      parcel.delivered_to_hub_at = receivedAt;
      parcel.status = ParcelStatus.STORED_AT_HUB;
      parcel.updated_at = receivedAt;
      const savedParcel = await parcels.save(parcel);

      // Final storage pricing is calculated when the recipient requests collection.
      return { parcel: savedParcel, invoice: null, alreadyConfirmed: false, invoiceDeferredUntilCollectionRequest: true };
    });
  }

  async requestCustomerCollection(parcelId: string, actor: UserPayload) {
    if (actor.role !== UserRole.RECIPIENT) throw new ForbiddenException('Only the parcel recipient can request collection');

    return this.dataSource.transaction(async (manager) => {
      const parcels = manager.getRepository(ParcelEntity);
      const parcel = await parcels.findOne({ where: { id: parcelId }, lock: { mode: 'pessimistic_write' } });
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
          parcel.status = ParcelStatus.READY_FOR_CUSTOMER;
          parcel.updated_at = new Date();
          await parcels.save(parcel);
        }
        return { parcel, invoice: existingInvoice, alreadyIssued: true };
      }

      if (parcel.status === ParcelStatus.STORED_AT_HUB) {
        if (!canTransitionParcel(parcel.status, ParcelStatus.READY_FOR_CUSTOMER)) {
          throw new ConflictException('Parcel cannot be prepared for customer collection');
        }
        parcel.status = ParcelStatus.READY_FOR_CUSTOMER;
        parcel.updated_at = new Date();
        await parcels.save(parcel);
      } else if (parcel.status !== ParcelStatus.READY_FOR_CUSTOMER) {
        throw new ConflictException('Parcel is not ready for customer collection');
      }

      const pricing = await this.pricingService.calculateWithActiveTariff(parcel, new Date());
      if (pricing.isExpired) {
        parcel.status = ParcelStatus.STORED_AT_HUB;
        parcel.expired_at = parcel.expired_at ?? new Date();
        parcel.updated_at = new Date();
        await parcels.save(parcel);
        return { parcel, invoice: null, expired: true, reason: 'STORAGE_LIMIT_REACHED' };
      }
      const invoice = await this.invoicesService.create(parcel, pricing, manager);
      return { parcel, invoice, alreadyIssued: false };
    });
  }

  private async findParcelForUpdate(manager: any, parcelId: string) {
    const repository = manager.getRepository(ParcelEntity);
    return repository.findOne({
      where: { id: parcelId },
      ...(manager.connection.options.type === 'postgres'
        ? { lock: { mode: 'pessimistic_write' as const } }
        : {}),
    });
  }

  private hashDeliveryCode(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private async sendDeliveryCode(phone: string, parcelId: string, code: string) {
    const endpoint = process.env.DELIVERY_CODE_SMS_URL;
    const token = process.env.DELIVERY_CODE_SMS_TOKEN;
    if (!endpoint || !token) {
      throw new ServiceUnavailableException('Delivery-code SMS gateway is not configured; set DELIVERY_CODE_SMS_URL and DELIVERY_CODE_SMS_TOKEN');
    }
    let parsed: URL;
    try { parsed = new URL(endpoint); } catch { throw new ServiceUnavailableException('Delivery-code SMS gateway URL is invalid'); }
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new ServiceUnavailableException('Production delivery-code SMS gateway must use HTTPS');
    }
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: phone,
          template: 'pudo_delivery_code',
          parcelId,
          message: `Pudo-N delivery code: ${code}. It expires in 10 minutes.`,
        }),
      });
    } catch {
      throw new ServiceUnavailableException('Delivery-code SMS gateway could not be reached');
    }
    if (!response.ok) throw new ServiceUnavailableException('Delivery-code SMS gateway rejected the request');
  }

  /** Issues a short-lived code only to the registered recipient phone through a configured SMS gateway. */
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
    const requestedAt = new Date();
    const expiresAt = new Date(requestedAt.getTime() + 10 * 60_000);
    const hash = this.hashDeliveryCode(code);
    await this.dataSource.transaction(async (manager) => {
      const parcels = manager.getRepository(ParcelEntity);
      const locked = await parcels.findOne({ where: { id: parcelId }, lock: { mode: 'pessimistic_write' } });
      if (!locked || locked.recipient_id !== actor.sub || locked.status !== ParcelStatus.READY_FOR_CUSTOMER) {
        throw new ConflictException('Parcel eligibility changed; request a new delivery code');
      }
      locked.delivery_code_hash = hash;
      locked.delivery_code_expires_at = expiresAt;
      locked.delivery_code_attempts = 0;
      locked.delivery_code_consumed_at = null;
      locked.delivery_code_requested_at = requestedAt;
      await parcels.save(locked);
    });

    try {
      await this.sendDeliveryCode(parcel.recipient_phone, parcel.id, code);
    } catch (error) {
      await this.repo.update(
        { id: parcel.id, delivery_code_hash: hash },
        { delivery_code_hash: null, delivery_code_expires_at: null },
      );
      throw error;
    }
    return { parcelId: parcel.id, sent: true, expiresAt: expiresAt.toISOString(), channel: 'SMS' };
  }

  /**
   * Release is gated by paid invoice and a valid, unexpired, one-time code sent to
   * the registered recipient phone. The parcel lock serializes concurrent attempts.
   */
  async confirmCustomerRelease(parcelId: string, actor: UserPayload, code: string, nationalId?: string) {
    if (actor.role !== UserRole.HUB_OWNER) {
      throw new ForbiddenException('Only the assigned hub owner can release a parcel');
    }
    if (!/^\\d{4,6}$/.test(String(code || ''))) throw new BadRequestException('A 4-6 digit delivery code is required');
    if (nationalId && !/^\\d{10}$/.test(nationalId)) throw new BadRequestException('National ID must contain 10 digits');

    const result = await this.dataSource.transaction(async (manager) => {
      const parcels = manager.getRepository(ParcelEntity);
      const parcel = await parcels.findOne({ where: { id: parcelId }, lock: { mode: 'pessimistic_write' } });
      if (!parcel) throw new NotFoundException('Parcel not found');
      const hub = parcel.current_hub_id
        ? await manager.getRepository(HubEntity).findOne({ where: { id: parcel.current_hub_id, owner_id: actor.sub } })
        : null;
      if (!hub) throw new ForbiddenException('Parcel is not stored at a hub owned by this user');

      if (parcel.status === ParcelStatus.COLLECTED && parcel.collected_at) {
        return { parcel, alreadyReleased: true };
      }
      if (parcel.status !== ParcelStatus.READY_FOR_CUSTOMER) {
        throw new ConflictException('Parcel must be ready for customer collection before release');
      }
      const invoice = await manager.getRepository(InvoiceEntity).findOne({ where: { parcel_id: parcel.id } });
      if (!invoice) throw new ConflictException('Parcel has no invoice; customer collection cannot be released');
      if (invoice.status !== PaymentStatus.PAID) {
        throw new ConflictException('Invoice must be PAID before physical parcel release');
      }
      if (!parcel.delivery_code_hash || !parcel.delivery_code_expires_at || parcel.delivery_code_consumed_at) {
        return { invalidCode: true, codeUnavailable: true };
      }
      if (parcel.delivery_code_expires_at.getTime() <= Date.now()) {
        parcel.delivery_code_hash = null;
        parcel.delivery_code_expires_at = null;
        await parcels.save(parcel);
        return { invalidCode: true, codeExpired: true };
      }
      const expected = Buffer.from(parcel.delivery_code_hash, 'hex');
      const supplied = Buffer.from(this.hashDeliveryCode(code), 'hex');
      const matches = expected.length === supplied.length && timingSafeEqual(expected, supplied);
      if (!matches) {
        parcel.delivery_code_attempts = (parcel.delivery_code_attempts ?? 0) + 1;
        if (parcel.delivery_code_attempts >= 5) {
          parcel.delivery_code_hash = null;
          parcel.delivery_code_expires_at = null;
        }
        await parcels.save(parcel);
        return { invalidCode: true, attemptsRemaining: Math.max(0, 5 - parcel.delivery_code_attempts) };
      }

      if (nationalId) {
        const recipient = parcel.recipient_id
          ? await manager.getRepository(UserEntity).findOne({ where: { id: parcel.recipient_id } })
          : null;
        if (recipient?.national_id && recipient.national_id !== nationalId) {
          return { nationalIdMismatch: true };
        }
        parcel.delivery_national_id_last4 = nationalId.slice(-4);
      }

      const oldStatus = parcel.status;
      let nextStatus: ParcelStatus = parcel.status;
      for (const status of [ParcelStatus.CUSTOMER_COLLECTION, ParcelStatus.COLLECTED]) {
        if (!canTransitionParcel(nextStatus, status)) {
          throw new ConflictException(`Invalid release transition from ${nextStatus} to ${status}`);
        }
        nextStatus = status;
      }
      const now = new Date();
      parcel.status = ParcelStatus.COLLECTED;
      parcel.collected_at = now;
      parcel.delivery_code_consumed_at = now;
      parcel.delivery_verified_at = now;
      parcel.delivery_verified_by = actor.sub;
      parcel.delivery_code_hash = null;
      parcel.delivery_code_expires_at = null;
      parcel.updated_at = now;
      await parcels.save(parcel);

      const postgres = manager.connection.options.type === 'postgres';
      const placeholders = postgres
        ? '$1, $2, \'parcel\', $3, \'PARCEL_DELIVERY_VERIFIED_AND_RELEASED\', $4, $5, $6, $7, $8'
        : '?, ?, \'parcel\', ?, \'PARCEL_DELIVERY_VERIFIED_AND_RELEASED\', ?, ?, ?, ?, ?';
      await manager.query(
        `INSERT INTO audit_logs (actor_id, actor_role, entity_type, entity_id, action, old_state, new_state, transaction_id, correlation_id, metadata)
         VALUES (${placeholders})`,
        [
          actor.sub, actor.role, parcel.id,
          JSON.stringify({ status: oldStatus }),
          JSON.stringify({ status: ParcelStatus.COLLECTED, collectedAt: now.toISOString(), verifiedByOneTimeCode: true }),
          parcel.id, `delivery:${parcel.id}:${now.getTime()}`,
          JSON.stringify({ invoiceId: invoice.id, nationalIdLast4: parcel.delivery_national_id_last4 ?? null }),
        ],
      );
      return { parcel, alreadyReleased: false, invoiceId: invoice.id, releasedAt: now.toISOString() };
    });

    if ('invalidCode' in result) {
      if ('codeExpired' in result) throw new UnauthorizedException('Delivery code expired; request a new code');
      if ('codeUnavailable' in result) throw new UnauthorizedException('No active delivery code; request one first');
      throw new UnauthorizedException(`Invalid delivery code; attempts remaining: ${result.attemptsRemaining}`);
    }
    if ('nationalIdMismatch' in result) throw new ForbiddenException('National ID does not match the registered recipient');
    return result;
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
