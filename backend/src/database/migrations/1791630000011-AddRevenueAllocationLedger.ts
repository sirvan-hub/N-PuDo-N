import { MigrationInterface, QueryRunner } from 'typeorm';

/** Immutable per-charge revenue split ledger. No historical charges are auto-credited. */
export class AddRevenueAllocationLedger1791630000011 implements MigrationInterface {
  name = 'AddRevenueAllocationLedger1791630000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "revenue_allocations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "charge_type" varchar(32) NOT NULL,
        "charge_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE RESTRICT,
        "parcel_id" uuid NOT NULL REFERENCES "parcels"("id") ON DELETE RESTRICT,
        "beneficiary_type" varchar(16) NOT NULL,
        "beneficiary_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "percentage" decimal(5,2) NOT NULL,
        "amount" bigint NOT NULL,
        "currency_unit" varchar(12) NOT NULL DEFAULT 'TOMAN',
        "allocation_snapshot" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_revenue_allocations_beneficiary_type"
          CHECK ("beneficiary_type" IN ('COURIER', 'HUB', 'PLATFORM')),
        CONSTRAINT "ck_revenue_allocations_beneficiary_id"
          CHECK (("beneficiary_type" = 'PLATFORM' AND "beneficiary_id" IS NULL)
              OR ("beneficiary_type" IN ('COURIER', 'HUB') AND "beneficiary_id" IS NOT NULL)),
        CONSTRAINT "ck_revenue_allocations_values"
          CHECK ("percentage" >= 0 AND "percentage" <= 100 AND "amount" >= 0),
        CONSTRAINT "uq_revenue_allocations_charge_beneficiary"
          UNIQUE ("charge_type", "charge_id", "beneficiary_type")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_revenue_allocations_beneficiary_created"
      ON "revenue_allocations" ("beneficiary_type", "beneficiary_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_revenue_allocations_beneficiary_created"`);
    await queryRunner.query(`DROP TABLE "revenue_allocations"`);
  }
}
