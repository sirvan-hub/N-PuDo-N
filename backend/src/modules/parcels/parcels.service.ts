import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParcelEntity } from '../../database/entities/parcel.entity';

@Injectable()
export class ParcelsService {
  constructor(
    @InjectRepository(ParcelEntity)
    private repo: Repository<ParcelEntity>,
  ) {}

  // ⚠️ دو ورودی: dto و courierId
  async create(dto: any, courierId: string) {
    const parcel = this.repo.create({
      ...dto,
      courier_id: courierId,
      status: 'PENDING_APPROVAL',
      created_at: new Date(),
      updated_at: new Date(),
    });
    return this.repo.save(parcel);
  }

  async getById(id: string) {
    const parcel = await this.repo.findOne({ where: { id } });
    if (!parcel) throw new Error('Parcel not found');
    return parcel;
  }
}