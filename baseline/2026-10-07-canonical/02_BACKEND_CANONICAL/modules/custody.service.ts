import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustodyTransferEntity } from '../../database/entities/custody-transfer.entity';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { CustodyTransferType, CustodyTransferStatus } from '../../database/entities/custody-transfer.entity';
import { ParcelStatus } from '../../modules/parcels/parcel.state-machine';
import { ParcelStateMachineService } from '../parcels/parcel-state-machine.service';

@Injectable()
export class CustodyService {
  constructor(
    @InjectRepository(CustodyTransferEntity)
    private repo: Repository<CustodyTransferEntity>,
    @InjectRepository(ParcelEntity)
    private parcelRepo: Repository<ParcelEntity>,
    @InjectRepository(HubEntity)
    private hubRepo: Repository<HubEntity>,
    private stateMachine: ParcelStateMachineService,
  ) {}

  async initiateHandover(parcelId: string, custodyCode: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    this.stateMachine.validateTransition(parcel.status, ParcelStatus.HANDOVER_IN_PROGRESS);

    const transfer = this.repo.create({
      parcel_id: parcelId,
      transfer_type: CustodyTransferType.HANDOVER,
      status: CustodyTransferStatus.COMPLETED,
      custody_code: custodyCode,
      completed_at: new Date(),
    });
    parcel.status = ParcelStatus.HANDOVER_IN_PROGRESS;
    await this.parcelRepo.save(parcel);
    return this.repo.save(transfer);
  }

  async transferToHub(parcelId: string, toHubId: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    this.stateMachine.validateTransition(parcel.status, ParcelStatus.TRANSFERRED_TO_HUB);

    const hub = await this.hubRepo.findOne({ where: { id: toHubId } });
    if (!hub) throw new NotFoundException('Hub not found');

    const transfer = this.repo.create({
      parcel_id: parcelId,
      from_hub_id: parcel.proposed_hub_id,
      to_hub_id: toHubId,
      transfer_type: CustodyTransferType.TRANSFER_TO_HUB,
      status: CustodyTransferStatus.COMPLETED,
      completed_at: new Date(),
    });
    parcel.status = ParcelStatus.TRANSFERRED_TO_HUB;
    parcel.proposed_hub_id = toHubId;
    await this.parcelRepo.save(parcel);
    return this.repo.save(transfer);
  }

  async receiveAtHub(parcelId: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    this.stateMachine.validateTransition(parcel.status, ParcelStatus.STORED_AT_HUB);

    const transfer = this.repo.create({
      parcel_id: parcelId,
      transfer_type: CustodyTransferType.RECEIVE_AT_HUB,
      status: CustodyTransferStatus.COMPLETED,
      completed_at: new Date(),
    });
    parcel.status = ParcelStatus.STORED_AT_HUB;
    await this.parcelRepo.save(parcel);
    return this.repo.save(transfer);
  }

  async deliverToCustomer(parcelId: string, otp: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    if (!otp || otp.length !== 6) throw new BadRequestException('Invalid OTP');
    this.stateMachine.validateTransition(parcel.status, ParcelStatus.COLLECTED);

    const transfer = this.repo.create({
      parcel_id: parcelId,
      transfer_type: CustodyTransferType.DELIVER_TO_CUSTOMER,
      status: CustodyTransferStatus.COMPLETED,
      completed_at: new Date(),
    });
    parcel.status = ParcelStatus.COLLECTED;
    await this.parcelRepo.save(parcel);
    return this.repo.save(transfer);
  }

  async getByParcel(parcelId: string) {
    return this.repo.find({ where: { parcel_id: parcelId }, order: { created_at: 'DESC' } });
  }
}
