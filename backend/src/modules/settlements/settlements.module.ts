import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from '../../database/entities/invoice.entity';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { IdempotencyRecordEntity } from '../../database/entities/idempotency-record.entity';
import { SettlementTransactionEntity } from '../../database/entities/settlement-transaction.entity';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity, ParcelEntity, IdempotencyRecordEntity, SettlementTransactionEntity])],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
