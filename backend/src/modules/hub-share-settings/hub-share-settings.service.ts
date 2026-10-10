import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HubShareSettingEntity } from '../../database/entities/hub-share-setting.entity';
import { HubShareRateHistoryEntity } from '../../database/entities/hub-share-rate-history.entity';
import { UserPayload } from '../../common/interfaces/user-payload.interface';

@Injectable()
export class HubShareSettingsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getCurrent() {
    const setting = await this.dataSource.getRepository(HubShareSettingEntity).findOne({ where: { id: 'default' } });
    return {
      percentage: setting ? Number(setting.percentage) : 30,
      updatedBy: setting?.updated_by ?? null,
      updatedAt: setting?.updated_at ?? null,
    };
  }

  async getHistory(limit = 50) {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const items = await this.dataSource.getRepository(HubShareRateHistoryEntity).find({
      order: { created_at: 'DESC', id: 'DESC' }, take: safeLimit,
    });
    return items.map((item) => ({
      id: item.id,
      oldPercentage: Number(item.old_percentage),
      newPercentage: Number(item.new_percentage),
      changedBy: item.changed_by,
      reason: item.reason,
      createdAt: item.created_at,
    }));
  }

  async updatePercentage(value: number, reason: string | undefined, actor: UserPayload) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100 ||
        Math.round(value * 100) !== value * 100) {
      throw new BadRequestException('percentage must be a number from 0 to 100 with at most two decimal places');
    }
    const normalizedReason = reason?.trim() || null;
    if (normalizedReason && normalizedReason.length > 500) {
      throw new BadRequestException('reason must be at most 500 characters');
    }

    return this.dataSource.transaction(async (manager) => {
      const settings = manager.getRepository(HubShareSettingEntity);
      const history = manager.getRepository(HubShareRateHistoryEntity);
      let setting = await settings.findOne({ where: { id: 'default' } });
      const oldPercentage = setting ? Number(setting.percentage) : 30;
      if (!setting) setting = settings.create({ id: 'default', percentage: 30, updated_by: null });
      setting.percentage = value;
      setting.updated_by = actor.sub;
      setting = await settings.save(setting);

      if (oldPercentage !== value) {
        await history.save(history.create({
          old_percentage: oldPercentage,
          new_percentage: value,
          changed_by: actor.sub,
          reason: normalizedReason,
        }));
      }
      return {
        percentage: Number(setting.percentage),
        updatedBy: setting.updated_by,
        updatedAt: setting.updated_at,
        previousPercentage: oldPercentage,
      };
    });
  }
}
