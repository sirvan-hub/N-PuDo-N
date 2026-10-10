import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the tables currently mapped by the active NestJS backend.
 * This is a core-schema migration, not the complete canonical Pudo-N domain
 * schema: registration/custody/audit/ledger/settlement tables remain a later
 * migration once their services and idempotency contract are implemented.
 */
export class InitialActivePostgresSchema1791630000000 implements MigrationInterface {
  name = 'InitialActivePostgresSchema1791630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "username" varchar(32) UNIQUE,
        "password_hash" varchar(255),
        "phone" varchar(15) NOT NULL UNIQUE,
        "full_name" varchar(100),
        "national_id" varchar(10),
        "role" varchar(20) NOT NULL DEFAULT 'RECIPIENT',
        "is_active" boolean NOT NULL DEFAULT true,
        "is_verified" boolean NOT NULL DEFAULT false,
        "verified_by" uuid,
        "verified_at" timestamptz,
        "failed_login_attempts" integer NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "hubs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "name" varchar(150) NOT NULL,
        "description" text,
        "phone" varchar(15),
        "address" text NOT NULL,
        "city" varchar(50) NOT NULL,
        "district" varchar(50),
        "operating_hours" jsonb NOT NULL,
        "max_capacity" integer NOT NULL DEFAULT 100,
        "current_capacity" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_temporarily_closed" boolean NOT NULL DEFAULT false,
        "qr_code_hash" varchar(64) NOT NULL UNIQUE,
        "rating" decimal(2,1) NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_hubs_owner" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "parcels" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tracking_code" varchar NOT NULL UNIQUE,
        "recipient_phone" varchar NOT NULL,
        "recipient_name" varchar NOT NULL,
        "recipient_address" varchar NOT NULL,
        "base_post_cost" integer NOT NULL,
        "proposed_hub_id" uuid,
        "recipient_id" uuid,
        "current_hub_id" uuid,
        "courier_id" uuid,
        "status" varchar(30) NOT NULL DEFAULT 'DELIVERY_ATTEMPT',
        "weight_kg" decimal(10,3),
        "description" text,
        "delivered_to_hub_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_parcels_proposed_hub" FOREIGN KEY ("proposed_hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_parcels_current_hub" FOREIGN KEY ("current_hub_id") REFERENCES "hubs"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_parcels_recipient" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_parcels_courier" FOREIGN KEY ("courier_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_parcels_base_post_cost_nonnegative" CHECK ("base_post_cost" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "invoice_number" varchar(30) NOT NULL UNIQUE,
        "parcel_id" uuid NOT NULL,
        "recipient_id" uuid NOT NULL,
        "hub_id" uuid NOT NULL,
        "base_post_cost" integer NOT NULL,
        "elapsed_hours" decimal(6,2) NOT NULL,
        "fee_percentage" decimal(5,2) NOT NULL,
        "calculated_fee" integer NOT NULL,
        "total_amount" integer NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "hub_owner_share" integer NOT NULL,
        "platform_fee" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_invoices_parcel" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_invoices_recipient" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_invoices_hub" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_invoices_amounts_nonnegative" CHECK (
          "base_post_cost" >= 0 AND "calculated_fee" >= 0 AND "total_amount" >= 0
          AND "hub_owner_share" >= 0 AND "platform_fee" >= 0
        )
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL UNIQUE,
        "balance" integer NOT NULL DEFAULT 0,
        "pending_balance" integer NOT NULL DEFAULT 0,
        "total_earned" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_wallets_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_wallets_balances_nonnegative" CHECK (
          "balance" >= 0 AND "pending_balance" >= 0 AND "total_earned" >= 0
        )
      )
    `);
    await queryRunner.query('CREATE INDEX "idx_hubs_owner_id" ON "hubs" ("owner_id")');
    await queryRunner.query('CREATE INDEX "idx_parcels_status" ON "parcels" ("status")');
    await queryRunner.query('CREATE INDEX "idx_parcels_recipient_phone" ON "parcels" ("recipient_phone")');
    await queryRunner.query('CREATE INDEX "idx_invoices_parcel_id" ON "invoices" ("parcel_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "wallets"');
    await queryRunner.query('DROP TABLE "invoices"');
    await queryRunner.query('DROP TABLE "parcels"');
    await queryRunner.query('DROP TABLE "hubs"');
    await queryRunner.query('DROP TABLE "users"');
  }
}
