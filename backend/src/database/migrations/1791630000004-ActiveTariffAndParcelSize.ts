import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add active versioned tariff and server-controlled package-size pricing. */
export class ActiveTariffAndParcelSize1791630000004 implements MigrationInterface {
  name = 'ActiveTariffAndParcelSize1791630000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parcels"
        ADD COLUMN "package_size" varchar(10) NOT NULL DEFAULT 'MEDIUM',
        ADD COLUMN "expired_at" timestamptz,
        ADD CONSTRAINT "ck_parcels_package_size" CHECK ("package_size" IN ('SMALL', 'MEDIUM', 'LARGE'))
    `);
    await queryRunner.query(`
      INSERT INTO "tariff_versions"
        ("version_key", "effective_from", "effective_until", "is_active",
         "small_base_amount", "medium_base_amount", "large_base_amount",
         "under_12h_percent", "from_12_to_24h_percent", "additional_started_24h_percent",
         "expiry_hours", "rounding_mode")
      VALUES ('PUDO-N-TARIFF-168H-V1', now(), NULL, TRUE, 18000, 25000, 35000, 20.00, 40.00, 50.00, 168, 'CEIL')
      ON CONFLICT ("version_key") DO NOTHING
    `);
    await queryRunner.query(`
      UPDATE "tariff_versions" SET "is_active" = FALSE
      WHERE "version_key" <> 'PUDO-N-TARIFF-168H-V1' AND "is_active" = TRUE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tariff_versions_single_active"
      ON "tariff_versions" ("is_active") WHERE "is_active" = TRUE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "uq_tariff_versions_single_active"');
    await queryRunner.query('ALTER TABLE "parcels" DROP CONSTRAINT "ck_parcels_package_size", DROP COLUMN "expired_at", DROP COLUMN "package_size"');
    await queryRunner.query(`DELETE FROM "tariff_versions" WHERE "version_key" = 'PUDO-N-TARIFF-168H-V1'`);
  }
}
