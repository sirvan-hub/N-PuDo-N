import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive domain/financial contract migration.
 * The initial core migration is intentionally unchanged.
 * Apply only to disposable/test PostgreSQL until a separately approved data plan exists.
 */
export class AddDomainFinancialContracts1791630000001 implements MigrationInterface {
  name = 'AddDomainFinancialContracts1791630000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wallets"
        ADD COLUMN "blocked_balance" bigint NOT NULL DEFAULT 0,
        ADD CONSTRAINT "ck_wallets_blocked_balance_nonnegative" CHECK ("blocked_balance" >= 0)
    `);

    await queryRunner.query(`
      CREATE TABLE "tariff_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "version_key" varchar(80) NOT NULL UNIQUE,
        "effective_from" timestamptz NOT NULL,
        "effective_until" timestamptz,
        "is_active" boolean NOT NULL DEFAULT false,
        "small_base_amount" bigint NOT NULL,
        "medium_base_amount" bigint NOT NULL,
        "large_base_amount" bigint NOT NULL,
        "under_12h_percent" numeric(7,2) NOT NULL DEFAULT 20.00,
        "from_12_to_24h_percent" numeric(7,2) NOT NULL DEFAULT 40.00,
        "additional_started_24h_percent" numeric(7,2) NOT NULL DEFAULT 50.00,
        "expiry_hours" integer NOT NULL DEFAULT 168,
        "rounding_mode" varchar(16) NOT NULL DEFAULT 'CEIL',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_tariff_versions_base_amounts_nonnegative" CHECK (
          "small_base_amount" >= 0 AND "medium_base_amount" >= 0 AND "large_base_amount" >= 0
        ),
        CONSTRAINT "ck_tariff_versions_percentages_nonnegative" CHECK (
          "under_12h_percent" >= 0 AND "from_12_to_24h_percent" >= 0
          AND "additional_started_24h_percent" >= 0
        ),
        CONSTRAINT "ck_tariff_versions_effective_range" CHECK (
          "effective_until" IS NULL OR "effective_until" > "effective_from"
        ),
        CONSTRAINT "ck_tariff_versions_expiry_positive" CHECK ("expiry_hours" > 0),
        CONSTRAINT "ck_tariff_versions_rounding_mode" CHECK ("rounding_mode" IN ('CEIL'))
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD COLUMN "tariff_version_id" uuid,
        ADD COLUMN "tariff_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN "paid_at" timestamptz,
        ADD CONSTRAINT "fk_invoices_tariff_version"
          FOREIGN KEY ("tariff_version_id") REFERENCES "tariff_versions"("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      DO $migration$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "invoices"
          WHERE "status" NOT IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'OVERDUE', 'CANCELLED')
        ) THEN
          RAISE EXCEPTION 'Cannot add invoice status constraint: unsupported existing status found';
        END IF;
      END
      $migration$
    `);
    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD CONSTRAINT "ck_invoices_status_valid"
        CHECK ("status" IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'OVERDUE', 'CANCELLED'))
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_invoices_tariff_version_id" ON "invoices" ("tariff_version_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "parcels"
        ADD COLUMN "accepted_at" timestamptz,
        ADD COLUMN "rejected_at" timestamptz,
        ADD COLUMN "collected_at" timestamptz,
        ADD COLUMN "delivered_at" timestamptz,
        ADD COLUMN "version" integer NOT NULL DEFAULT 1,
        ADD COLUMN "rejected_reason" text,
        ADD CONSTRAINT "ck_parcels_version_positive" CHECK ("version" > 0)
    `);

    await queryRunner.query(`
      CREATE TABLE "idempotency_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_scope" varchar(120) NOT NULL,
        "operation_type" varchar(80) NOT NULL,
        "idempotency_key" varchar(255) NOT NULL,
        "request_hash" char(64) NOT NULL,
        "state" varchar(16) NOT NULL DEFAULT 'IN_PROGRESS',
        "response_status" integer,
        "response_body" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        CONSTRAINT "uq_idempotency_scope_operation_key"
          UNIQUE ("actor_scope", "operation_type", "idempotency_key"),
        CONSTRAINT "ck_idempotency_request_hash" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "ck_idempotency_state" CHECK ("state" IN ('IN_PROGRESS', 'COMPLETED')),
        CONSTRAINT "ck_idempotency_response_status" CHECK (
          "response_status" IS NULL OR ("response_status" BETWEEN 100 AND 599)
        ),
        CONSTRAINT "ck_idempotency_completion_consistency" CHECK (
          ("state" = 'IN_PROGRESS' AND "completed_at" IS NULL)
          OR ("state" = 'COMPLETED' AND "completed_at" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "wallet_id" uuid NOT NULL,
        "actor_id" uuid,
        "idempotency_record_id" uuid,
        "transaction_type" varchar(40) NOT NULL,
        "bucket" varchar(16) NOT NULL,
        "amount" bigint NOT NULL,
        "bucket_balance_after" bigint NOT NULL,
        "currency_unit" varchar(12) NOT NULL DEFAULT 'TOMAN',
        "reference_type" varchar(40),
        "reference_id" uuid,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_wallet_transactions_wallet"
          FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_wallet_transactions_actor"
          FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_wallet_transactions_idempotency"
          FOREIGN KEY ("idempotency_record_id") REFERENCES "idempotency_records"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_wallet_transactions_idempotency" UNIQUE ("idempotency_record_id"),
        CONSTRAINT "ck_wallet_transactions_bucket" CHECK ("bucket" IN ('AVAILABLE', 'PENDING', 'BLOCKED')),
        CONSTRAINT "ck_wallet_transactions_type" CHECK (
          "transaction_type" IN ('OPENING_BALANCE', 'OPENING_PENDING', 'OPENING_BLOCKED',
            'EARNING_CREDIT', 'PENDING_CREDIT', 'RELEASE_PENDING', 'HOLD', 'RELEASE_HOLD',
            'DEBIT', 'PAYOUT', 'REFUND', 'ADJUSTMENT')
        ),
        CONSTRAINT "ck_wallet_transactions_amount_nonzero" CHECK ("amount" <> 0),
        CONSTRAINT "ck_wallet_transactions_balance_nonnegative" CHECK ("bucket_balance_after" >= 0),
        CONSTRAINT "ck_wallet_transactions_currency_unit" CHECK ("currency_unit" = 'TOMAN')
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_wallet_transactions_wallet_created" ON "wallet_transactions" ("wallet_id", "created_at")`);

    // Establish migration-time opening entries for existing balances. These are not a reconstruction
    // of pre-migration history; they provide a truthful opening point for future ledger reconciliation.
    await queryRunner.query(`
      INSERT INTO "wallet_transactions"
        ("wallet_id", "transaction_type", "bucket", "amount", "bucket_balance_after", "currency_unit", "description")
      SELECT "id", 'OPENING_BALANCE', 'AVAILABLE', "balance", "balance", 'TOMAN',
             'Opening available balance at domain-ledger migration'
      FROM "wallets" WHERE "balance" > 0
    `);
    await queryRunner.query(`
      INSERT INTO "wallet_transactions"
        ("wallet_id", "transaction_type", "bucket", "amount", "bucket_balance_after", "currency_unit", "description")
      SELECT "id", 'OPENING_PENDING', 'PENDING', "pending_balance", "pending_balance", 'TOMAN',
             'Opening pending balance at domain-ledger migration'
      FROM "wallets" WHERE "pending_balance" > 0
    `);
    await queryRunner.query(`
      INSERT INTO "wallet_transactions"
        ("wallet_id", "transaction_type", "bucket", "amount", "bucket_balance_after", "currency_unit", "description")
      SELECT "id", 'OPENING_BLOCKED', 'BLOCKED', 0 + "blocked_balance", "blocked_balance", 'TOMAN',
             'Opening blocked balance at domain-ledger migration'
      FROM "wallets" WHERE "blocked_balance" > 0
    `);

    await queryRunner.query(`
      CREATE TABLE "registration_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "parcel_id" uuid NOT NULL,
        "actor_id" uuid,
        "selected_hub_id" uuid,
        "request_reason" varchar(32) NOT NULL,
        "outcome" varchar(16) NOT NULL,
        "rejection_reason" text,
        "idempotency_record_id" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_registration_parcel" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_registration_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_registration_hub" FOREIGN KEY ("selected_hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_registration_idempotency" FOREIGN KEY ("idempotency_record_id") REFERENCES "idempotency_records"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_registration_idempotency" UNIQUE ("idempotency_record_id"),
        CONSTRAINT "ck_registration_reason" CHECK ("request_reason" IN ('CUSTOMER_REQUEST', 'FAILED_HOME_DELIVERY')),
        CONSTRAINT "ck_registration_outcome" CHECK ("outcome" IN ('REQUESTED', 'ACCEPTED', 'REJECTED', 'HUB_SELECTED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_registration_parcel_created" ON "registration_transactions" ("parcel_id", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE "custody_transfers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "parcel_id" uuid NOT NULL,
        "from_hub_id" uuid,
        "to_hub_id" uuid,
        "sender_id" uuid,
        "receiver_id" uuid,
        "transfer_type" varchar(32) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "code_salt" char(32) NOT NULL,
        "code_hash" char(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "failed_attempts" integer NOT NULL DEFAULT 0,
        "idempotency_record_id" uuid,
        "failure_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        CONSTRAINT "fk_custody_parcel" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_custody_from_hub" FOREIGN KEY ("from_hub_id") REFERENCES "hubs"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_custody_to_hub" FOREIGN KEY ("to_hub_id") REFERENCES "hubs"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_custody_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_custody_receiver" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_custody_idempotency" FOREIGN KEY ("idempotency_record_id") REFERENCES "idempotency_records"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_custody_idempotency" UNIQUE ("idempotency_record_id"),
        CONSTRAINT "ck_custody_transfer_type" CHECK ("transfer_type" IN ('COURIER_TO_HUB', 'HUB_TO_HUB', 'HUB_TO_RECIPIENT')),
        CONSTRAINT "ck_custody_status" CHECK ("status" IN ('PENDING', 'CONFIRMED', 'EXPIRED', 'REJECTED')),
        CONSTRAINT "ck_custody_code_salt" CHECK ("code_salt" ~ '^[0-9a-f]{32}$'),
        CONSTRAINT "ck_custody_code_hash" CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "ck_custody_failed_attempts_nonnegative" CHECK ("failed_attempts" >= 0),
        CONSTRAINT "ck_custody_consumed_once" CHECK (
          ("status" = 'CONFIRMED' AND "consumed_at" IS NOT NULL AND "completed_at" IS NOT NULL)
          OR ("status" <> 'CONFIRMED' AND "consumed_at" IS NULL)
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_custody_parcel_created" ON "custody_transfers" ("parcel_id", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE "settlement_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "parcel_id" uuid,
        "invoice_id" uuid,
        "wallet_id" uuid,
        "actor_id" uuid,
        "transaction_type" varchar(24) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'PENDING',
        "amount" bigint NOT NULL,
        "currency_unit" varchar(12) NOT NULL DEFAULT 'TOMAN',
        "idempotency_record_id" uuid,
        "provider_reference" varchar(160),
        "failure_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        CONSTRAINT "fk_settlement_parcel" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_settlement_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_settlement_wallet" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_settlement_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_settlement_idempotency" FOREIGN KEY ("idempotency_record_id") REFERENCES "idempotency_records"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_settlement_idempotency" UNIQUE ("idempotency_record_id"),
        CONSTRAINT "ck_settlement_type" CHECK ("transaction_type" IN ('PAYMENT', 'REFUND', 'HUB_PAYOUT', 'HOLD', 'RELEASE')),
        CONSTRAINT "ck_settlement_status" CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
        CONSTRAINT "ck_settlement_amount_nonnegative" CHECK ("amount" >= 0),
        CONSTRAINT "ck_settlement_currency_unit" CHECK ("currency_unit" = 'TOMAN'),
        CONSTRAINT "ck_settlement_completion_consistency" CHECK (
          ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
          OR ("status" <> 'COMPLETED')
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actor_id" uuid,
        "actor_role" varchar(32),
        "entity_type" varchar(64) NOT NULL,
        "entity_id" uuid,
        "action" varchar(80) NOT NULL,
        "old_state" jsonb,
        "new_state" jsonb,
        "transaction_id" uuid,
        "correlation_id" varchar(120),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_audit_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_audit_entity_created" ON "audit_logs" ("entity_type", "entity_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_correlation_id" ON "audit_logs" ("correlation_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "audit_logs"');
    await queryRunner.query('DROP TABLE "settlement_transactions"');
    await queryRunner.query('DROP TABLE "custody_transfers"');
    await queryRunner.query('DROP TABLE "registration_transactions"');
    await queryRunner.query('DROP TABLE "wallet_transactions"');
    await queryRunner.query('DROP TABLE "idempotency_records"');
    await queryRunner.query('DROP INDEX "idx_invoices_tariff_version_id"');
    await queryRunner.query('ALTER TABLE "invoices" DROP CONSTRAINT "ck_invoices_status_valid"');
    await queryRunner.query('ALTER TABLE "invoices" DROP CONSTRAINT "fk_invoices_tariff_version"');
    await queryRunner.query('ALTER TABLE "invoices" DROP COLUMN "paid_at", DROP COLUMN "tariff_snapshot", DROP COLUMN "tariff_version_id"');
    await queryRunner.query('ALTER TABLE "parcels" DROP CONSTRAINT "ck_parcels_version_positive", DROP COLUMN "rejected_reason", DROP COLUMN "version", DROP COLUMN "delivered_at", DROP COLUMN "collected_at", DROP COLUMN "rejected_at", DROP COLUMN "accepted_at"');
    await queryRunner.query('ALTER TABLE "wallets" DROP CONSTRAINT "ck_wallets_blocked_balance_nonnegative", DROP COLUMN "blocked_balance"');
    await queryRunner.query('DROP TABLE "tariff_versions"');
  }
}
