import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistrationTransactionEntity } from '../../database/entities/registration-transaction.entity';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { RegistrationTransactionType, RegistrationTransactionStatus } from '../../database/entities/registration-transaction.entity';
import { ParcelStatus } from '../../modules/parcels/parcel.state-machine';
import { ParcelStateMachineService } from '../parcels/parcel-state-machine.service';

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(RegistrationTransactionEntity)
    private repo: Repository<RegistrationTransactionEntity>,
    @InjectRepository(ParcelEntity)
    private parcelRepo: Repository<ParcelEntity>,
    @InjectRepository(HubEntity)
    private hubRepo: Repository<HubEntity>,
    private stateMachine: ParcelStateMachineService,
  ) {}

  async submitPudoRequest(parcelId: string, hubId?: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    this.stateMachine.validateTransition(parcel.status, ParcelStatus.CUSTOMER_REQUEST);

    const transaction = this.repo.create({
      parcel_id: parcelId,
      hub_id: hubId,
      transaction_type: RegistrationTransactionType.PUDO_REQUEST,
      status: RegistrationTransactionStatus.PENDING,
    });
    parcel.status = ParcelStatus.CUSTOMER_REQUEST;
    await this.parcelRepo.save(parcel);
    return this.repo.save(transaction);
  }

  async acceptPudoRequest(parcelId: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    this.stateMachine.validateTransition(parcel.status, ParcelStatus.HUB_SELECTED);

    const transaction = this.repo.create({
      parcel_id: parcelId,
      transaction_type: RegistrationTransactionType.PUDO_ACCEPT,
      status: RegistrationTransactionStatus.CONFIRMED,
      confirmed_at: new Date(),
    });
    parcel.status = ParcelStatus.HUB_SELECTED;
    await this.parcelRepo.save(parcel);
    return this.repo.save(transaction);
  }

  async rejectPudoRequest(parcelId: string, reason: string) {
    const parcel = await this.parcelRepo.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    this.stateMachine.validateTransition(parcel.status, ParcelStatus.FAILED_DELIVERY);

    const transaction = this.repo.create({
      parcel_id: parcelId,
      transaction_type: RegistrationTransactionType.PUDO_REJECT,
      status: RegistrationTransactionStatus.REJECTED,
      rejection_reason: reason,
    });
    parcel.status = ParcelStatus.FAILED_DELIVERY;
    await this.parcelRepo.save(parcel);
    return this.repo.save(transaction);
  }

  async getByParcel(parcelId: string) {
    return this.repo.find({ where: { parcel_id: parcelId }, order: { created_at: 'DESC' } });
  }
}
