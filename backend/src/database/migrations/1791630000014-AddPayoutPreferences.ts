import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds actor-scoped payout cadence and manually verified opaque destination references. */
export class AddPayoutPreferences1791630000014 implements MigrationInterface {
  name = 'AddPayoutPreferences1791630000014';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payout_preferences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL UNIQUE,
        "frequency" varchar(10) NOT NULL DEFAULT 'MONTHLY',
        "destination_token" varchar(160),
        "destination_last4" varchar(4),
        "destination_verified_at" timestamptz,
        "destination_verified_by" uuid,
        "verification_reference" varchar(160),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_payout_preferences_frequency" CHECK ("frequency" IN ('WEEKLY', 'MONTHLY')),
        CONSTRAINT "ck_payout_preferences_last4" CHECK ("destination_last4" IS NULL OR "destination_last4" ~ '^[0-9]{4}$'),
        CONSTRAINT "fk_payout_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_payout_preferences_verified_by" FOREIGN KEY ("destination_verified_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query('CREATE INDEX "idx_payout_preferences_verification" ON "payout_preferences" ("destination_verified_at", "updated_at")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_payout_preferences_verification"');
    await queryRunner.query('DROP TABLE "payout_preferences"');
  }
}
