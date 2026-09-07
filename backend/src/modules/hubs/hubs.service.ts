import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HubEntity } from '../../database/entities/hub.entity';

@Injectable()
export class HubsService {
  constructor(
    @InjectRepository(HubEntity)
    private repo: Repository<HubEntity>,
  ) {}

  async create(dto: any, ownerId: string) {
    const hub = this.repo.create({
      ...dto,
      owner_id: ownerId,
      current_capacity: 0,
      is_active: true,
      is_temporarily_closed: false,
      rating: 0,
    });
    return this.repo.save(hub);
  }

  async findNearby(lat: number, lng: number, radiusKm: number = 2, limit: number = 10) {
    const results = await this.repo.createQueryBuilder('hub')
      .where('hub.is_active = :active', { active: true })
      .andWhere('hub.is_temporarily_closed = :closed', { closed: false })
      .orderBy('hub.current_capacity', 'ASC')
      .limit(limit)
      .getMany();
    return results.map((h) => ({
      id: h.id,
      name: h.name,
      address: h.address,
      phone: h.phone,
      rating: h.rating,
      current_capacity: h.current_capacity,
      max_capacity: h.max_capacity,
      has_capacity: h.current_capacity < h.max_capacity,
      distance_meters: 0,
    }));
  }

  async getById(id: string) {
    const hub = await this.repo.findOne({ where: { id }, relations: ['owner'] });
    if (!hub) throw new Error('Hub not found');
    return hub;
  }
}