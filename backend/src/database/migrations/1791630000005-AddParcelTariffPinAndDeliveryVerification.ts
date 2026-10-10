import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParcelTariffPinAndDeliveryVerification1791630000005 implements MigrationInterface {
  name = 'AddParcelTariffPinAndDeliveryVerification1791630000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE parcels ADD COLUMN IF NOT EXISTS tariff_version_id uuid NULL`);
    await queryRunner.query(`ALTER TABLE parcels ADD COLUMN IF NOT EXISTS delivery_code_hash varchar(128) NULL`);
    await queryRunner.query(`ALTER TABLE parcels ADD COLUMN IF NOT EXISTS delivery_code_expires_at timestamptz NULL`);
    await queryRunner.query(`ALTER TABLE parcels ADD COLUMN IF NOT EXISTS delivery_code_attempts integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE parcels ADD COLUMN IF NOT EXISTS delivery_code_consumed_at timestamptz NULL`);
    await queryRunner.query(`ALTER TABLE parcels ADD COLUMN IF NOT EXISTS delivery_code_requested_at timestamptz NULL`);
    await queryRunner.query(`ALTER TABLE parcels ADD COLUMN IF NOT EXISTS delivery_verified_at timestamptz NULL`);
    await queryRunner.query(`ALTER TABLE parcels ADD COLUMN IF NOT EXISTS delivery_verified_by uuid NULL`);
    await queryRunner.query(`ALTER TABLE parcels ADD COLUMN IF NOT EXISTS delivery_national_id_last4 varchar(4) NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_parcels_tariff_version_id ON parcels (tariff_version_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_parcels_tariff_version_id`);
    await queryRunner.query(`ALTER TABLE parcels DROP COLUMN IF EXISTS delivery_national_id_last4`);
    await queryRunner.query(`ALTER TABLE parcels DROP COLUMN IF EXISTS delivery_verified_by`);
    await queryRunner.query(`ALTER TABLE parcels DROP COLUMN IF EXISTS delivery_verified_at`);
    await queryRunner.query(`ALTER TABLE parcels DROP COLUMN IF EXISTS delivery_code_requested_at`);
    await queryRunner.query(`ALTER TABLE parcels DROP COLUMN IF EXISTS delivery_code_consumed_at`);
    await queryRunner.query(`ALTER TABLE parcels DROP COLUMN IF EXISTS delivery_code_attempts`);
    await queryRunner.query(`ALTER TABLE parcels DROP COLUMN IF EXISTS delivery_code_expires_at`);
    await queryRunner.query(`ALTER TABLE parcels DROP COLUMN IF EXISTS delivery_code_hash`);
    await queryRunner.query(`ALTER TABLE parcels DROP COLUMN IF EXISTS tariff_version_id`);
  }
}
