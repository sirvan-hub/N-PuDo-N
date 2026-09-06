import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesService } from './invoices.service';
import { InvoiceEntity } from '../../database/entities/invoice.entity';

@Module({ imports: [TypeOrmModule.forFeature([InvoiceEntity])], providers: [InvoicesService], exports: [InvoicesService] })
export class InvoicesModule {}
