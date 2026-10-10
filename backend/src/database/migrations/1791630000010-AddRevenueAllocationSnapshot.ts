import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds immutable 30/30/40 allocation snapshots for new invoices.
 * Historical invoices are explicitly marked for reconciliation; they are not
 * silently reallocated or credited by this migration.
 */
export class AddRevenueAllocationSnapshot1791630000010 implements MigrationInterface {
  name = 'AddRevenueAllocationSnapshot1791630000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD COLUMN "courier_share" integer NOT NULL DEFAULT 0,
        ADD COLUMN "revenue_allocation_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      UPDATE "invoices"
      SET "revenue_allocation_snapshot" = jsonb_build_object(
        'snapshotVersion', 1,
        'allocationStatus', 'LEGACY_REQUIRES_RECONCILIATION',
        'source', 'pre-30-30-40-invoice',
        'totalAmount', "total_amount",
        'legacyHubOwnerShare', "hub_owner_share",
        'legacyPlatformFee', "platform_fee",
        'currencyUnit', 'TOMAN'
      )
      WHERE "revenue_allocation_snapshot" = '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "ck_invoices_allocation_nonnegative"
        CHECK ("courier_share" >= 0 AND "hub_owner_share" >= 0 AND "platform_fee" >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "ck_invoices_allocation_nonnegative"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "revenue_allocation_snapshot", DROP COLUMN "courier_share"`);
  }
}
