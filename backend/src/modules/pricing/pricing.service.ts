import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Pudo-N canonical tariff, measured from delivered_to_hub_at.
 * Rounding: monetary fee is rounded up to the next whole currency unit.
 * At 24h the fee remains 40%; any elapsed time beyond 24h starts an
 * additional 24h interval. At 168h the fee is 340% and the parcel expires.
 */
@Injectable()
export class PricingService {
  calculate(parcel: any, now: Date = new Date()) {
    if (!parcel?.delivered_to_hub_at) {
      throw new BadRequestException('Not delivered to hub');
    }

    const deliveredAt = new Date(parcel.delivered_to_hub_at);
    const currentTime = new Date(now);
    const basePostCost = Number(parcel.base_post_cost);
    if (!Number.isFinite(deliveredAt.getTime()) || !Number.isFinite(currentTime.getTime())) {
      throw new BadRequestException('Invalid pricing timestamp');
    }
    if (!Number.isFinite(basePostCost) || basePostCost < 0) {
      throw new BadRequestException('Invalid base post cost');
    }

    const elapsed = (currentTime.getTime() - deliveredAt.getTime()) / 3_600_000;
    if (elapsed < 0) throw new BadRequestException('Pricing time precedes hub delivery');

    let pct: number;
    if (elapsed < 12) pct = 0.20;
    else if (elapsed <= 24) pct = 0.40;
    else pct = 0.40 + Math.ceil((elapsed - 24) / 24) * 0.50;

    const fee = Math.ceil(basePostCost * pct);
    return {
      basePostCost,
      elapsedHours: Math.round(elapsed * 100) / 100,
      feePercentage: pct,
      calculatedFee: fee,
      isExpired: elapsed >= 168,
    };
  }
}
