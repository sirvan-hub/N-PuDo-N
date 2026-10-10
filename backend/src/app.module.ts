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
import { SettlementsModule } from './modules/settlements/settlements.module';
import { HubShareSettingsModule } from './modules/hub-share-settings/hub-share-settings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

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
    SettlementsModule,
    HubShareSettingsModule,
    NotificationsModule,
  ],
})
export class AppModule {};
