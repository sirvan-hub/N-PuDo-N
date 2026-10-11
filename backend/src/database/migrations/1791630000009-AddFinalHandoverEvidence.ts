import { MigrationInterface, QueryRunner } from 'typeorm';

/** Track final hub and recipient evidence separately from one-time code verification. */
export class AddFinalHandoverEvidence1791630000009 implements MigrationInterface {
  name = 'AddFinalHandoverEvidence1791630000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "custody_transfers"
        ADD COLUMN "code_verified_at" timestamptz,
        ADD COLUMN "hub_handover_evidence_ref" varchar(512),
        ADD COLUMN "recipient_handover_evidence_ref" varchar(512),
        ADD COLUMN "recipient_handover_at" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "custody_transfers"
        ADD CONSTRAINT "ck_custody_transfer_handover_evidence_pair"
          CHECK (("recipient_handover_evidence_ref" IS NULL) = ("recipient_handover_at" IS NULL))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "custody_transfers"
        DROP CONSTRAINT "ck_custody_transfer_handover_evidence_pair",
        DROP COLUMN "recipient_handover_at",
        DROP COLUMN "recipient_handover_evidence_ref",
        DROP COLUMN "hub_handover_evidence_ref",
        DROP COLUMN "code_verified_at"
    `);
  }
}
