import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from '../../database/entities/invoice.entity';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { WalletTransactionEntity } from '../../database/entities/wallet-transaction.entity';
import { IdempotencyRecordEntity } from '../../database/entities/idempotency-record.entity';
import { SettlementTransactionEntity } from '../../database/entities/settlement-transaction.entity';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { HubPayoutRequestsController } from './hub-payout-requests.controller';
import { HubPayoutRequestsService } from './hub-payout-requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    InvoiceEntity, ParcelEntity, HubEntity, WalletEntity, WalletTransactionEntity,
    IdempotencyRecordEntity, SettlementTransactionEntity,
  ])],
  controllers: [SettlementsController, HubPayoutRequestsController],
  providers: [SettlementsService, HubPayoutRequestsService],
  exports: [SettlementsService, HubPayoutRequestsService],
})
export class SettlementsModule {}
