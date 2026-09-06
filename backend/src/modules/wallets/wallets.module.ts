import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsService } from './wallets.service';
import { WalletEntity } from '../../database/entities/wallet.entity';

@Module({ imports: [TypeOrmModule.forFeature([WalletEntity])], providers: [WalletsService], exports: [WalletsService] })
export class WalletsModule {}
