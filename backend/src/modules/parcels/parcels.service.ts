import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParcelEntity, ParcelStatus } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { PricingService } from '../pricing/pricing.service';
import { InvoicesService } from '../invoices/invoices.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ParcelsService {
  private readonly logger = new Logger(ParcelsService.name);

  constructor(
    @InjectRepository(ParcelEntity) private parcelRepo: Repository<ParcelEntity>,
    @InjectRepository(HubEntity) private hubRepo: Repository<HubEntity>,
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    private pricingService: PricingService,
    private invoicesService: InvoicesService,
  ) {}

  async create(dto: any, courierId: string) {
    const hub = await this.hubRepo.findOne({ where: { id: dto.proposed_hub_id, is_active: true } });
    if (!hub) throw new NotFoundException('Hub not found');
    if (hub.current_capacity >= hub.max_capacity) throw new BadRequestException('Hub full');
    let recipient = await this.userRepo.findOne({ where: { phone: dto.recipient_phone } });
    if (!recipient) {
      recipient = this.userRepo.create({ phone: dto.recipient_phone, full_name: dto.recipient_name, role: 'RECIPIENT' as any });
      recipient = await this.userRepo.save(recipient);
    }
    const parcel = this.parcelRepo.create({
      tracking_code: dto.tracking_code, recipient_id: recipient.id, recipient_name: dto.recipient_name,
      recipient_phone: dto.recipient_phone, recipient_address: dto.recipient_address,
      courier_id: courierId, current_hub_id: dto.proposed_hub_id,
      base_post_cost: dto.base_post_cost, status: ParcelStatus.PENDING_APPROVAL,
    });
    return this.parcelRepo.save(parcel);
  }

  async approve(parcelId: string, recipientId: string, accepted: boolean) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    if (parcel.recipient_id !== recipientId) throw new ForbiddenException('Not your parcel');
    if (parcel.status !== ParcelStatus.PENDING_APPROVAL) throw new BadRequestException('Invalid status');
    parcel.status = accepted ? ParcelStatus.APPROVED_BY_RECIPIENT : ParcelStatus.REJECTED;
    if (accepted) parcel.approved_by_recipient_at = new Date();
    return this.parcelRepo.save(parcel);
  }

  async deliverToHub(parcelId: string, hubQrCode: string, lat: number, lng: number) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    const hub = await this.hubRepo.findOne({ where: { qr_code_hash: hubQrCode } });
    if (!hub) throw new NotFoundException('Hub not found');
    parcel.status = ParcelStatus.DELIVERED_TO_HUB;
    parcel.current_hub_id = hub.id;
    parcel.delivered_to_hub_at = new Date();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    parcel.pickup_otp_hash = await bcrypt.hash(otp, 10);
    parcel.pickup_otp_expires_at = new Date(Date.now() + 120 * 3600000);
    hub.current_capacity += 1;
    await this.hubRepo.save(hub);
    this.logger.log('OTP for pickup: ' + otp);
    return this.parcelRepo.save(parcel);
  }

  async pickup(parcelId: string, hubOwnerId: string, otp: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId }, relations: ['current_hub'] });
    if (!parcel) throw new NotFoundException('Parcel not found');
    if (parcel.current_hub?.owner_id !== hubOwnerId) throw new ForbiddenException('Not your hub');
    const valid = await bcrypt.compare(otp, parcel.pickup_otp_hash);
    if (!valid) throw new BadRequestException('Invalid OTP');
    const pricing = this.pricingService.calculate(parcel);
    parcel.calculated_hub_fee = pricing.calculatedFee;
    parcel.status = ParcelStatus.PICKED_UP;
    parcel.picked_up_at = new Date();
    const hub = await this.hubRepo.findOne({ where: { id: parcel.current_hub_id } });
    hub.current_capacity = Math.max(0, hub.current_capacity - 1);
    await this.hubRepo.save(hub);
    const saved = await this.parcelRepo.save(parcel);
    const invoice = await this.invoicesService.create(parcel, pricing);
    return { parcel: saved, invoice };
  }

  async getById(id: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id }, relations: ['recipient', 'courier', 'current_hub'] });
    if (!parcel) throw new NotFoundException('Parcel not found');
    return parcel;
  }
}
