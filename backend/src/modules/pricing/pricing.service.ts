import { Injectable } from '@nestjs/common';

@Injectable()
export class PricingService {
  calculate(parcel: any, now: Date = new Date()) {
    if (!parcel.delivered_to_hub_at) throw new Error('Not delivered to hub');
    const elapsed = (now.getTime() - new Date(parcel.delivered_to_hub_at).getTime()) / 3600000;
    let pct = 0;
    if (elapsed <= 12) pct = 0.30;
    else if (elapsed <= 36) pct = 0.70;
    else { pct = 0.70 + Math.ceil((elapsed - 36) / 48) * 0.60; }
    const fee = Math.ceil(Number(parcel.base_post_cost) * pct);
    return { basePostCost: Number(parcel.base_post_cost), elapsedHours: Math.round(elapsed * 100) / 100, feePercentage: pct, calculatedFee: fee, isExpired: elapsed >= 120 };
  }
}
