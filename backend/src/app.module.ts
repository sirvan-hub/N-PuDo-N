import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseOptions } from './database/database-options';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ParcelsModule } from './modules/parcels/parcels.module';
import { HubsModule } from './modules/hubs/hubs.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { WalletsModule } from './modules/wallets/wallets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(createDatabaseOptions()),
    AuthModule,
    UsersModule,
    ParcelsModule,
    HubsModule,
    PricingModule,
    InvoicesModule,
    WalletsModule,
  ],
})
export class AppModule {};
