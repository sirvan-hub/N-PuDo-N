import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InvoiceEntity, PaymentStatus } from '../../database/entities/invoice.entity';
import { HubShareSettingEntity } from '../../database/entities/hub-share-setting.entity';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(InvoiceEntity) private repo: Repository<InvoiceEntity>,
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  private async getCurrentHubSharePercent(): Promise<number> {
    if (!this.dataSource) return 30;
    const setting = await this.dataSource.getRepository(HubShareSettingEntity).findOne({ where: { id: 'default' } });
    const percentage = setting ? Number(setting.percentage) : 30;
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new Error('Configured hub share percentage is outside the supported range');
    }
    return percentage;
  }

  async create(parcel: any, pricing: any) {
    if (!parcel?.recipient_id || !parcel?.current_hub_id) {
      throw new BadRequestException('Invoice requires a resolved recipient and current hub');
    }
    const hubSharePercent = await this.getCurrentHubSharePercent();
    const totalAmount = Number(pricing.calculatedFee);
    if (!Number.isSafeInteger(totalAmount) || totalAmount < 0) {
      throw new BadRequestException('Invoice amount must be a non-negative whole currency unit');
    }
    // Floor to a whole toman so the hub share never exceeds the configured percentage.
    const hubOwnerShare = Math.floor(totalAmount * hubSharePercent / 100);
    const snapshot = {
      snapshotVersion: 1,
      rule: 'fixed-percentage-of-invoice-total',
      percentage: hubSharePercent,
      basisAmount: totalAmount,
      hubOwnerShare,
      currencyUnit: 'TOMAN',
      capturedAt: new Date().toISOString(),
    };
    const invoice = this.repo.create({
      invoice_number: 'INV-' + Date.now(),
      parcel_id: parcel.id, recipient_id: parcel.recipient_id, hub_id: parcel.current_hub_id,
      base_post_cost: pricing.basePostCost, elapsed_hours: pricing.elapsedHours,
      fee_percentage: pricing.feePercentage * 100, calculated_fee: totalAmount,
      total_amount: totalAmount, status: PaymentStatus.PENDING,
      hub_owner_share: hubOwnerShare, platform_fee: 0,
      hub_share_percent: hubSharePercent, hub_share_snapshot: snapshot,
    });
    return this.repo.save(invoice);
  }
}
