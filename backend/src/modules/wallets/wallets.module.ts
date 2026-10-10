import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsService } from './wallets.service';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { WalletTransactionEntity } from '../../database/entities/wallet-transaction.entity';
import { IdempotencyRecordEntity } from '../../database/entities/idempotency-record.entity';

@Module({ imports: [TypeOrmModule.forFeature([WalletEntity, WalletTransactionEntity, IdempotencyRecordEntity])], controllers: [WalletsController], providers: [WalletsService], exports: [WalletsService] })
export class WalletsModule {}
