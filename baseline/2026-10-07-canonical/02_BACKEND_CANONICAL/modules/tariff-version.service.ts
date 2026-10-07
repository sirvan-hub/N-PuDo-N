import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TariffVersionEntity, TariffStatus } from '../../database/entities/tariff-version.entity';

@Injectable()
export class TariffVersionService {
  constructor(
    @InjectRepository(TariffVersionEntity)
    private repo: Repository<TariffVersionEntity>,
  ) {}

  async getActiveTariff(): Promise<TariffVersionEntity> {
    const tariff = await this.repo.findOne({
      where: { status: TariffStatus.ACTIVE },
      order: { created_at: 'DESC' },
    });
    if (!tariff) throw new BadRequestException('No active tariff version found');
    return tariff;
  }

  async getAllTariffs(): Promise<TariffVersionEntity[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async createTariff(dto: Partial<TariffVersionEntity>): Promise<TariffVersionEntity> {
    const tariff = this.repo.create({ ...dto, status: TariffStatus.ACTIVE });
    await this.deactivateCurrent();
    return this.repo.save(tariff);
  }

  async deactivateCurrent(): Promise<void> {
    await this.repo.update({ status: TariffStatus.ACTIVE }, { status: TariffStatus.INACTIVE });
  }

  async getTariffById(id: string): Promise<TariffVersionEntity | undefined> {
    return this.repo.findOne({ where: { id } });
  }
}
