import { Injectable, BadRequestException } from '@nestjs/common';
import { TariffVersionEntity } from '../../database/entities/tariff-version.entity';
import { TariffVersionService } from './tariff-version.service';

@Injectable()
export class PricingService {
  constructor(private tariffService: TariffVersionService) {}

  async calculate(parcel: any, now: Date = new Date()): Promise<any> {
    if (!parcel.delivered_to_hub_at) throw new BadRequestException('Not delivered to hub');
    const elapsed = (now.getTime() - new Date(parcel.delivered_to_hub_at).getTime()) / 3600000;
    const tariff = await this.tariffService.getActiveTariff();
    const fee = this.calculateFee(parcel.base_post_cost, elapsed, tariff);
    return {
      basePostCost: Number(parcel.base_post_cost),
      elapsedHours: Math.round(elapsed * 100) / 100,
      feePercentage: fee.percentage,
      calculatedFee: fee.amount,
      tariffVersion: tariff.version,
      isExpired: elapsed >= 120,
    };
  }

  calculateFee(basePostCost: number, elapsedHours: number, tariff: TariffVersionEntity): { percentage: number; amount: number } {
    const pct = this.getFeePercentage(elapsedHours, tariff);
    const amount = Math.ceil(Number(basePostCost) * pct);
    return { percentage: pct, amount };
  }

  getFeePercentage(elapsedHours: number, tariff: TariffVersionEntity): number {
    if (elapsedHours <= tariff.threshold_12h_hours) return tariff.fee_percentage_under_12h;
    if (elapsedHours <= tariff.threshold_24h_hours) return tariff.fee_percentage_under_24h;
    const additional24h = Math.ceil((elapsedHours - tariff.threshold_24h_hours) / tariff.threshold_24h_hours);
    return tariff.fee_percentage_under_24h + additional24h * tariff.fee_percentage_per_additional_24h;
  }
}
