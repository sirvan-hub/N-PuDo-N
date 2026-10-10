import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubShareSettingEntity } from '../../database/entities/hub-share-setting.entity';
import { HubShareRateHistoryEntity } from '../../database/entities/hub-share-rate-history.entity';
import { HubShareSettingsController } from './hub-share-settings.controller';
import { HubShareSettingsService } from './hub-share-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([HubShareSettingEntity, HubShareRateHistoryEntity])],
  controllers: [HubShareSettingsController],
  providers: [HubShareSettingsService],
  exports: [HubShareSettingsService],
})
export class HubShareSettingsModule {}
