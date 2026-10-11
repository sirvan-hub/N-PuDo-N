import { MigrationInterface, QueryRunner } from 'typeorm';

/** Allow the same immutable allocation ledger to reference either an invoice or an entry-fee charge. */
export class LinkEntryFeesToRevenueAllocations1791630000013 implements MigrationInterface {
  name = 'LinkEntryFeesToRevenueAllocations1791630000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "revenue_allocations"
        ALTER COLUMN "charge_id" DROP NOT NULL,
        ADD COLUMN "network_entry_charge_id" uuid REFERENCES "network_entry_charges"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "revenue_allocations"
        ADD CONSTRAINT "ck_revenue_allocations_charge_reference"
        CHECK (
          ("charge_id" IS NOT NULL AND "network_entry_charge_id" IS NULL)
          OR ("charge_id" IS NULL AND "network_entry_charge_id" IS NOT NULL)
        )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_revenue_allocations_entry_beneficiary"
      ON "revenue_allocations" ("charge_type", "network_entry_charge_id", "beneficiary_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_revenue_allocations_entry_beneficiary"`);
    await queryRunner.query(`ALTER TABLE "revenue_allocations" DROP CONSTRAINT "ck_revenue_allocations_charge_reference"`);
    await queryRunner.query(`
      ALTER TABLE "revenue_allocations"
        DROP COLUMN "network_entry_charge_id",
        ALTER COLUMN "charge_id" SET NOT NULL
    `);
  }
}
