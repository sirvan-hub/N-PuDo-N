import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { NetworkEntryChargeEntity } from '../../database/entities/network-entry-charge.entity';
import { CustodyTransferEntity } from '../../database/entities/custody-transfer.entity';
import { EvidenceStorageController } from './evidence-storage.controller';
import { EvidenceStorageService } from './evidence-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([ParcelEntity, HubEntity, NetworkEntryChargeEntity, CustodyTransferEntity])],
  controllers: [EvidenceStorageController],
  providers: [EvidenceStorageService],
  exports: [EvidenceStorageService],
})
export class EvidenceStorageModule {}
