import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubsController } from './hubs.controller';
import { HubsService } from './hubs.service';
import { HubEntity } from '../../database/entities/hub.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HubEntity])],
  controllers: [HubsController],
  providers: [HubsService],
  exports: [HubsService],
})
export class HubsModule {}
