import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
      const parcel = await parcels.findOne({ where: { id: parcelId }, lock: { mode: 'pessimistic_write' } });
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
      const parcel = await parcels.findOne({
        where: { id: parcelId },
        lock: { mode: 'pessimistic_write' },
      });
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
        parcel.expired_at = parcel.expired_at ?? new Date();
        parcel.updated_at = new Date();
        await parcels.save(parcel);
        return { parcel, invoice: null, expired: true, reason: 'STORAGE_LIMIT_REACHED' };
      }
      const invoice = await this.invoicesService.create(parcel, pricing, manager);
      return { parcel, invoice, alreadyIssued: false };
    });
  }

  /**
   * Physical release is a hub-owner action and is blocked until the linked invoice
   * has been reconciled as PAID by the authorized payment-reconciliation workflow.
   */
  async confirmCustomerRelease(parcelId: string, actor: UserPayload) {
    if (actor.role !== UserRole.HUB_OWNER) {
      throw new ForbiddenException('Only the assigned hub owner can release a parcel');
    }
    return this.dataSource.transaction(async (manager) => {
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

      let nextStatus = parcel.status;
      for (const status of [ParcelStatus.CUSTOMER_COLLECTION, ParcelStatus.COLLECTED]) {
        if (!canTransitionParcel(nextStatus, status)) {
          throw new ConflictException(`Invalid release transition from ${nextStatus} to ${status}`);
        }
        nextStatus = status;
      }
      const now = new Date();
      parcel.status = ParcelStatus.COLLECTED;
      parcel.collected_at = now;
      parcel.updated_at = now;
      await parcels.save(parcel);
      return { parcel, alreadyReleased: false, invoiceId: invoice.id, releasedAt: now.toISOString() };
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
