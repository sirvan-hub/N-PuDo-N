import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InvoiceEntity, PaymentStatus } from '../../database/entities/invoice.entity';
import { HubShareSettingEntity } from '../../database/entities/hub-share-setting.entity';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(InvoiceEntity) private repo: Repository<InvoiceEntity>,
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  private async getCurrentHubSharePercent(manager?: EntityManager): Promise<number> {
    const settings = manager
      ? manager.getRepository(HubShareSettingEntity)
      : this.dataSource?.getRepository(HubShareSettingEntity);
    if (!settings) return 30;
    const setting = await settings.findOne({ where: { id: 'default' } });
    const percentage = setting ? Number(setting.percentage) : 30;
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new Error('Configured hub share percentage is outside the supported range');
    }
    return percentage;
  }

  async create(parcel: any, pricing: any, manager?: EntityManager) {
    if (!parcel?.recipient_id || !parcel?.current_hub_id) {
      throw new BadRequestException('Invoice requires a resolved recipient and current hub');
    }
    const invoiceRepo = manager ? manager.getRepository(InvoiceEntity) : this.repo;
    const existing = invoiceRepo.findOne ? await invoiceRepo.findOne({ where: { parcel_id: parcel.id } }) : null;
    if (existing) return existing;

    const hubSharePercent = await this.getCurrentHubSharePercent(manager);
    const totalAmount = Number(pricing.calculatedFee);
    if (!Number.isSafeInteger(totalAmount) || totalAmount < 0) {
      throw new BadRequestException('Invoice amount must be a non-negative whole currency unit');
    }
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
    const invoice = invoiceRepo.create({
      invoice_number: 'INV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      parcel_id: parcel.id, recipient_id: parcel.recipient_id, hub_id: parcel.current_hub_id,
      base_post_cost: pricing.basePostCost, elapsed_hours: pricing.elapsedHours,
      fee_percentage: pricing.feePercentage * 100, calculated_fee: totalAmount,
      total_amount: totalAmount, status: PaymentStatus.PENDING,
      hub_owner_share: hubOwnerShare, platform_fee: 0,
      tariff_snapshot: pricing.tariffSnapshot ?? {
        snapshotVersion: 1, tariffKey: 'PUDO-N-TARIFF-168H-V1',
        basePostCost: pricing.basePostCost, elapsedHours: pricing.elapsedHours,
        feePercentage: pricing.feePercentage * 100, calculatedFee: totalAmount,
        currencyUnit: 'TOMAN',
      },
      tariff_version_id: pricing.tariffVersionId ?? null,
      hub_share_percent: hubSharePercent, hub_share_snapshot: snapshot,
    });
    return invoiceRepo.save(invoice);
  }
}
