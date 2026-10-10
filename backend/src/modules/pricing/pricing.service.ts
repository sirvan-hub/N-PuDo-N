import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Pudo-N canonical tariff, measured from delivered_to_hub_at.
 * Rounding: monetary fee is rounded up to the next whole currency unit.
 * At 24h the fee remains 40%; any elapsed time beyond 24h starts an
 * additional 24h interval. At 168h the fee is 340% and the parcel expires.
 */
@Injectable()
export class PricingService {
  constructor(@Optional() @InjectDataSource() private readonly dataSource?: DataSource) {}

  async calculateWithActiveTariff(parcel: any, now: Date = new Date()) {
    if (!this.dataSource) throw new BadRequestException('Tariff database is unavailable');
    const postgres = this.dataSource.options.type === 'postgres';
    const rows = await this.dataSource.query(
      `SELECT id, version_key, small_base_amount, medium_base_amount, large_base_amount,
              under_12h_percent, from_12_to_24h_percent, additional_started_24h_percent,
              expiry_hours, rounding_mode
         FROM tariff_versions
        WHERE is_active = TRUE AND effective_from <= ${postgres ? '$1' : '?'}
          AND (effective_until IS NULL OR effective_until > ${postgres ? '$1' : '?'})
        ORDER BY effective_from DESC LIMIT 2`,
      postgres ? [now.toISOString()] : [now.toISOString(), now.toISOString()],
    );
    if (rows.length !== 1) throw new BadRequestException('Exactly one active effective tariff version is required');
    const tariff = rows[0];
    const size = String(parcel?.package_size || '').toUpperCase();
    const amounts: Record<string, unknown> = {
      SMALL: tariff.small_base_amount, MEDIUM: tariff.medium_base_amount, LARGE: tariff.large_base_amount,
    };
    if (!(size in amounts)) throw new BadRequestException('A valid package_size is required');
    const result = this.calculate({ ...parcel, base_post_cost: Number(amounts[size]) }, now, {
      id: tariff.id, versionKey: tariff.version_key,
      under12HoursPercent: Number(tariff.under_12h_percent),
      from12To24HoursPercent: Number(tariff.from_12_to_24h_percent),
      additionalStarted24HoursPercent: Number(tariff.additional_started_24h_percent),
      expiryHours: Number(tariff.expiry_hours), roundingMode: tariff.rounding_mode,
    });
    return { ...result, tariffVersionId: tariff.id };
  }

  calculate(parcel: any, now: Date = new Date(), tariff: any = null) {
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

    const expiryHours = Number(tariff?.expiryHours ?? 168);
    const under12 = Number(tariff?.under12HoursPercent ?? 20) / 100;
    const from12To24 = Number(tariff?.from12To24HoursPercent ?? 40) / 100;
    const additionalStarted24 = Number(tariff?.additionalStarted24HoursPercent ?? 50) / 100;
    if (![expiryHours, under12, from12To24, additionalStarted24].every(Number.isFinite) ||
        expiryHours <= 0 || under12 < 0 || from12To24 < 0 || additionalStarted24 < 0) {
      throw new BadRequestException('Invalid active tariff configuration');
    }
    const billableElapsed = Math.min(elapsed, expiryHours);
    let pct: number;
    if (billableElapsed < 12) pct = under12;
    else if (billableElapsed <= 24) pct = from12To24;
    else pct = from12To24 + Math.ceil((billableElapsed - 24) / 24) * additionalStarted24;

    const fee = Math.ceil(basePostCost * pct);
    const elapsedHours = Math.round(billableElapsed * 100) / 100;
    return {
      basePostCost,
      elapsedHours,
      actualElapsedHours: Math.round(elapsed * 100) / 100,
      feePercentage: pct,
      calculatedFee: fee,
      isExpired: elapsed >= expiryHours,
      tariffSnapshot: {
        snapshotVersion: 1,
        tariffKey: tariff?.versionKey ?? 'PUDO-N-TARIFF-168H-V1',
        tariffVersionId: tariff?.id ?? null,
        clockStartsAt: 'delivered_to_hub_at',
        actualElapsedHours: Math.round(elapsed * 100) / 100,
        billableElapsedHours: elapsedHours,
        under12HoursPercent: 20,
        from12To24HoursPercent: 40,
        additionalStarted24HoursPercent: additionalStarted24 * 100,
        maxBillableHours: expiryHours,
        appliedPercentage: pct * 100,
        basePostCost,
        calculatedFee: fee,
        roundingMode: 'CEIL',
        currencyUnit: 'TOMAN',
        calculatedAt: currentTime.toISOString(),
        capReached: elapsed >= expiryHours,
      },
    };
  }
}
