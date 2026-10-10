import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceEntity, PaymentStatus } from '../../database/entities/invoice.entity';

@Injectable()
export class InvoicesService {
  constructor(@InjectRepository(InvoiceEntity) private repo: Repository<InvoiceEntity>) {}

  async create(parcel: any, pricing: any) {
    if (!parcel?.recipient_id || !parcel?.current_hub_id) {
      throw new BadRequestException('Invoice requires a resolved recipient and current hub');
    }
    // Revenue allocation has not been approved; do not encode the historical 70/30 assumption.
    // Keep compatibility columns at zero until an explicit commercial rule is approved.
    const invoice = this.repo.create({
      invoice_number: 'INV-' + Date.now(),
      parcel_id: parcel.id, recipient_id: parcel.recipient_id, hub_id: parcel.current_hub_id,
      base_post_cost: pricing.basePostCost, elapsed_hours: pricing.elapsedHours,
      fee_percentage: pricing.feePercentage * 100, calculated_fee: pricing.calculatedFee,
      total_amount: pricing.calculatedFee, status: PaymentStatus.PENDING,
      hub_owner_share: 0, platform_fee: 0,
    });
    return this.repo.save(invoice);
  }
}
