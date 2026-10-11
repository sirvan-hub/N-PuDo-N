import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add configurable hub revenue share and auditable settlement request/review metadata. */
export class ConfigurableHubShareAndSettlementRequests1791630000003 implements MigrationInterface {
  name = 'ConfigurableHubShareAndSettlementRequests1791630000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "hub_share_settings" (
        "id" varchar(32) PRIMARY KEY,
        "percentage" numeric(5,2) NOT NULL DEFAULT 30.00,
        "updated_by" uuid,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_hub_share_percentage_range" CHECK ("percentage" >= 0 AND "percentage" <= 100),
        CONSTRAINT "fk_hub_share_settings_actor" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      INSERT INTO "hub_share_settings" ("id", "percentage") VALUES ('default', 30.00)
    `);
    await queryRunner.query(`
      CREATE TABLE "hub_share_rate_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "old_percentage" numeric(5,2) NOT NULL,
        "new_percentage" numeric(5,2) NOT NULL,
        "changed_by" uuid,
        "reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_hub_share_history_percentages" CHECK (
          "old_percentage" >= 0 AND "old_percentage" <= 100 AND
          "new_percentage" >= 0 AND "new_percentage" <= 100
        ),
        CONSTRAINT "fk_hub_share_history_actor" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD COLUMN "hub_share_percent" numeric(5,2),
        ADD COLUMN "hub_share_snapshot" jsonb
    `);
    // Historical invoices are intentionally left without a new share snapshot.
    // Only invoices created after this migration use the configurable 30% default.

    await queryRunner.query(`
      ALTER TABLE "settlement_transactions"
        ADD COLUMN "hub_id" uuid,
        ADD COLUMN "requested_by" uuid,
        ADD COLUMN "reviewed_by" uuid,
        ADD COLUMN "reviewed_at" timestamptz,
        ADD COLUMN "review_note" varchar(500),
        ADD CONSTRAINT "fk_settlement_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "fk_settlement_requested_by" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "fk_settlement_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query('ALTER TABLE "settlement_transactions" DROP CONSTRAINT "ck_settlement_status"');
    await queryRunner.query(`
      ALTER TABLE "settlement_transactions"
        ADD CONSTRAINT "ck_settlement_status"
        CHECK ("status" IN ('PENDING', 'REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED', 'CANCELLED'))
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_hub_payout_requests_owner_status"
      ON "settlement_transactions" ("hub_id", "status", "created_at")
      WHERE "transaction_type" = 'HUB_PAYOUT'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_hub_payout_requests_owner_status"');
    await queryRunner.query('ALTER TABLE "settlement_transactions" DROP CONSTRAINT "ck_settlement_status"');
    await queryRunner.query(`
      ALTER TABLE "settlement_transactions"
        ADD CONSTRAINT "ck_settlement_status"
        CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'))
    `);
    await queryRunner.query(`
      ALTER TABLE "settlement_transactions"
        DROP CONSTRAINT "fk_settlement_reviewed_by",
        DROP CONSTRAINT "fk_settlement_requested_by",
        DROP CONSTRAINT "fk_settlement_hub",
        DROP COLUMN "review_note",
        DROP COLUMN "reviewed_at",
        DROP COLUMN "reviewed_by",
        DROP COLUMN "requested_by",
        DROP COLUMN "hub_id"
    `);
    await queryRunner.query('ALTER TABLE "invoices" DROP COLUMN "hub_share_snapshot", DROP COLUMN "hub_share_percent"');
    await queryRunner.query('DROP TABLE "hub_share_rate_history"');
    await queryRunner.query('DROP TABLE "hub_share_settings"');
  }
}
