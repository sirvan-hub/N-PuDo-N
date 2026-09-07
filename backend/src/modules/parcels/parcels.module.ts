import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParcelsController } from './parcels.controller';
import { ParcelsService } from './parcels.service';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { PricingModule } from '../pricing/pricing.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [TypeOrmModule.forFeature([ParcelEntity, HubEntity, UserEntity]), PricingModule, InvoicesModule],
  controllers: [ParcelsController],
  providers: [ParcelsService],
  exports: [ParcelsService],
})
export class ParcelsModule {}
