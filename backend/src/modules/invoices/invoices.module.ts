import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesService } from './invoices.service';
import { InvoiceEntity } from '../../database/entities/invoice.entity';
import { HubShareSettingEntity } from '../../database/entities/hub-share-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity, HubShareSettingEntity])],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
