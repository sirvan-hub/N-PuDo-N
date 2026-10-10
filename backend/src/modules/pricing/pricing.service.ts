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
    const currentTime = now;
    const basePostCost = Number(parcel.base_post_cost);
    if (!Number.isFinite(deliveredAt.getTime()) || !Number.isFinite(currentTime.getTime())) {
      throw new BadRequestException('Invalid pricing timestamp');
    }
    if (!Number.isFinite(basePostCost) || basePostCost < 0) {
      throw new BadRequestException('Invalid base post cost');
    }

    const elapsed = (currentTime.getTime() - deliveredAt.getTime()) / 3_600_000;
    if (elapsed < 0) throw new BadRequestException('Pricing time precedes hub delivery');

    const billableElapsed = Math.min(elapsed, 168);
    let pct: number;
    if (billableElapsed < 12) pct = 0.20;
    else if (billableElapsed <= 24) pct = 0.40;
    else pct = 0.40 + Math.ceil((billableElapsed - 24) / 24) * 0.50;

    const fee = Math.ceil(basePostCost * pct);
    const elapsedHours = Math.round(billableElapsed * 100) / 100;
    return {
      basePostCost,
      elapsedHours,
      actualElapsedHours: Math.round(elapsed * 100) / 100,
      feePercentage: pct,
      calculatedFee: fee,
      isExpired: elapsed >= 168,
      tariffSnapshot: {
        snapshotVersion: 1,
        tariffKey: 'PUDO-N-TARIFF-168H-V1',
        clockStartsAt: 'delivered_to_hub_at',
        actualElapsedHours: Math.round(elapsed * 100) / 100,
        billableElapsedHours: elapsedHours,
        under12HoursPercent: 20,
        from12To24HoursPercent: 40,
        additionalStarted24HoursPercent: 50,
        maxBillableHours: 168,
        appliedPercentage: pct * 100,
        basePostCost,
        calculatedFee: fee,
        roundingMode: 'CEIL',
        currencyUnit: 'TOMAN',
        calculatedAt: currentTime.toISOString(),
        capReached: elapsed >= 168,
      },
    };
  }
}
