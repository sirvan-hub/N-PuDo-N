import { MigrationInterface, QueryRunner } from 'typeorm';

/** Pin each parcel to the tariff version that supplied its creation-time base price. */
export class AddParcelTariffPin1791630000005 implements MigrationInterface {
  name = 'AddParcelTariffPin1791630000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "parcels" ADD COLUMN "tariff_version_id" uuid`);
    await queryRunner.query(`CREATE INDEX "idx_parcels_tariff_version_id" ON "parcels" ("tariff_version_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_parcels_tariff_version_id"`);
    await queryRunner.query(`ALTER TABLE "parcels" DROP COLUMN "tariff_version_id"`);
  }
}
