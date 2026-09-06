import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HubEntity } from '../../database/entities/hub.entity';

@Injectable()
export class HubsService {
  constructor(@InjectRepository(HubEntity) private repo: Repository<HubEntity>) {}

  async findNearby(lat: number, lng: number, radiusKm: number = 2, limit: number = 10) {
    const radiusMeters = radiusKm * 1000;
    const results = await this.repo.createQueryBuilder('hub')
      .where('hub.is_active = :active', { active: true })
      .andWhere('hub.is_temporarily_closed = :closed', { closed: false })
      .orderBy('hub.current_capacity', 'ASC')
      .limit(limit)
      .getMany();
    return results.map(h => ({
      id: h.id, name: h.name, address: h.address, phone: h.phone,
      rating: h.rating, is_open_now: true,
      current_capacity: h.current_capacity, max_capacity: h.max_capacity,
      has_capacity: h.current_capacity < h.max_capacity,
      distance_meters: 0,
    }));
  }

  async getById(id: string) {
    const hub = await this.repo.findOne({ where: { id }, relations: ['owner'] });
    if (!hub) throw new NotFoundException('Hub not found');
    return hub;
  }
}
