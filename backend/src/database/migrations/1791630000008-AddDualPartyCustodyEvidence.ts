import { MigrationInterface, QueryRunner } from 'typeorm';

/** Store opaque private-object references and independent custody confirmations. */
export class AddDualPartyCustodyEvidence1791630000008 implements MigrationInterface {
  name = 'AddDualPartyCustodyEvidence1791630000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parcels"
        ADD COLUMN "courier_handover_evidence_ref" varchar(512),
        ADD COLUMN "courier_handover_at" timestamptz,
        ADD COLUMN "hub_receipt_evidence_ref" varchar(512),
        ADD COLUMN "hub_receipt_confirmed_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "parcels"
        ADD CONSTRAINT "ck_parcels_courier_evidence_pair"
          CHECK (("courier_handover_evidence_ref" IS NULL) = ("courier_handover_at" IS NULL)),
        ADD CONSTRAINT "ck_parcels_hub_evidence_pair"
          CHECK (("hub_receipt_evidence_ref" IS NULL) = ("hub_receipt_confirmed_at" IS NULL))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parcels"
        DROP CONSTRAINT "ck_parcels_hub_evidence_pair",
        DROP CONSTRAINT "ck_parcels_courier_evidence_pair",
        DROP COLUMN "hub_receipt_confirmed_at",
        DROP COLUMN "hub_receipt_evidence_ref",
        DROP COLUMN "courier_handover_at",
        DROP COLUMN "courier_handover_evidence_ref"
    `);
  }
}
