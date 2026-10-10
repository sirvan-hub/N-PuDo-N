import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';
import { ParcelStatus } from './parcel-state-machine';

@Injectable()
export class ParcelsService {
  constructor(
    @InjectRepository(ParcelEntity)
    private repo: Repository<ParcelEntity>,
  ) {}

  async create(dto: any, courierId: string) {
    const parcel = this.repo.create({
      ...dto,
      courier_id: courierId,
      status: ParcelStatus.DELIVERY_ATTEMPT,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return this.repo.save(parcel);
  }

  async getById(id: string, requester: UserPayload) {
    const parcel = await this.repo.findOne({ where: { id } });
    if (!parcel) throw new NotFoundException('Parcel not found');

    const isAdministrator = requester.role === UserRole.ADMIN || requester.role === UserRole.SUPER_ADMIN;
    const isAssignedCourier = parcel.courier_id === requester.sub;
    const isRecipient = parcel.recipient_phone === requester.phone;
    if (!isAdministrator && !isAssignedCourier && !isRecipient) {
      throw new ForbiddenException('You do not have access to this parcel');
    }

    return parcel;
  }
}
