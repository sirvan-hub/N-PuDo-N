import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceEntity, PaymentStatus } from '../../database/entities/invoice.entity';

@Injectable()
export class InvoicesService {
  constructor(@InjectRepository(InvoiceEntity) private repo: Repository<InvoiceEntity>) {}

  async create(parcel: any, pricing: any) {
    const hubShare = Math.round(pricing.calculatedFee * 0.7);
    const platformFee = pricing.calculatedFee - hubShare;
    const invoice = this.repo.create({
      invoice_number: 'INV-' + Date.now(),
      parcel_id: parcel.id, recipient_id: parcel.recipient_id, hub_id: parcel.current_hub_id,
      base_post_cost: pricing.basePostCost, elapsed_hours: pricing.elapsedHours,
      fee_percentage: pricing.feePercentage * 100, calculated_fee: pricing.calculatedFee,
      total_amount: pricing.calculatedFee, status: PaymentStatus.PENDING,
      hub_owner_share: hubShare, platform_fee: platformFee,
    });
    return this.repo.save(invoice);
  }
}
