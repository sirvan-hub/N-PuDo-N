import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from '../../database/entities/invoice.entity';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { WalletTransactionEntity } from '../../database/entities/wallet-transaction.entity';
import { IdempotencyRecordEntity } from '../../database/entities/idempotency-record.entity';
import { SettlementTransactionEntity } from '../../database/entities/settlement-transaction.entity';
import { PayoutPreferenceEntity } from '../../database/entities/payout-preference.entity';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { HubPayoutRequestsController } from './hub-payout-requests.controller';
import { HubPayoutRequestsService } from './hub-payout-requests.service';
import { CourierPayoutRequestsController } from './courier-payout-requests.controller';
import { CourierPayoutRequestsService } from './courier-payout-requests.service';
import { PayoutPreferencesController } from './payout-preferences.controller';
import { PayoutPreferencesService } from './payout-preferences.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    InvoiceEntity, ParcelEntity, HubEntity, WalletEntity, WalletTransactionEntity,
    IdempotencyRecordEntity, SettlementTransactionEntity, PayoutPreferenceEntity,
  ])],
  controllers: [SettlementsController, HubPayoutRequestsController, CourierPayoutRequestsController, PayoutPreferencesController],
  providers: [SettlementsService, HubPayoutRequestsService, CourierPayoutRequestsService, PayoutPreferencesService],
  exports: [SettlementsService, HubPayoutRequestsService, CourierPayoutRequestsService, PayoutPreferencesService],
})
export class SettlementsModule {}
