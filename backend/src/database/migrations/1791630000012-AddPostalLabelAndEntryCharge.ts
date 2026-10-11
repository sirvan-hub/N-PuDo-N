import { MigrationInterface, QueryRunner } from 'typeorm';

/** Separate actual postal-label data and the Pudo-N network-entry charge lifecycle. */
export class AddPostalLabelAndEntryCharge1791630000012 implements MigrationInterface {
  name = 'AddPostalLabelAndEntryCharge1791630000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parcels"
        ADD COLUMN "barcode" varchar(120),
        ADD COLUMN "postal_postage_amount" integer,
        ADD COLUMN "sender_name" varchar(120),
        ADD COLUMN "sender_phone" varchar(15),
        ADD COLUMN "label_image_ref" varchar(512),
        ADD CONSTRAINT "ck_parcels_postal_postage_nonnegative"
          CHECK ("postal_postage_amount" IS NULL OR "postal_postage_amount" >= 0)
    `);
    await queryRunner.query(`
      CREATE TABLE "network_entry_charges" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "parcel_id" uuid NOT NULL UNIQUE REFERENCES "parcels"("id") ON DELETE RESTRICT,
        "postal_postage_amount" integer NOT NULL,
        "fee_percent" decimal(5,2) NOT NULL,
        "amount" integer NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'PENDING_RECEIPT',
        "receipt_evidence_ref" varchar(512),
        "provider_reference" varchar(160) UNIQUE,
        "verified_by" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
        "verified_at" timestamptz,
        "tariff_snapshot" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_network_entry_charge_values"
          CHECK ("postal_postage_amount" >= 0 AND "fee_percent" >= 30 AND "fee_percent" <= 40 AND "amount" >= 0),
        CONSTRAINT "ck_network_entry_charge_status"
          CHECK ("status" IN ('PENDING_RECEIPT', 'RECEIPT_SUBMITTED', 'VERIFIED', 'REJECTED')),
        CONSTRAINT "ck_network_entry_charge_verification"
          CHECK (
            ("status" <> 'VERIFIED')
            OR ("receipt_evidence_ref" IS NOT NULL AND "provider_reference" IS NOT NULL
                AND "verified_by" IS NOT NULL AND "verified_at" IS NOT NULL)
          )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "network_entry_charges"`);
    await queryRunner.query(`
      ALTER TABLE "parcels"
        DROP CONSTRAINT "ck_parcels_postal_postage_nonnegative",
        DROP COLUMN "label_image_ref",
        DROP COLUMN "sender_phone",
        DROP COLUMN "sender_name",
        DROP COLUMN "postal_postage_amount",
        DROP COLUMN "barcode"
    `);
  }
}
