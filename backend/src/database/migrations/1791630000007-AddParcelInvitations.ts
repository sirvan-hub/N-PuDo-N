import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add recipient consent invitations before official parcel registration. */
export class AddParcelInvitations1791630000007 implements MigrationInterface {
  name = 'AddParcelInvitations1791630000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "parcel_invitations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "courier_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "recipient_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "recipient_phone" varchar(15) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "responded_at" timestamptz,
        "accepted_at" timestamptz,
        "parcel_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_parcel_invitations_status"
          CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'USED')),
        CONSTRAINT "ck_parcel_invitations_response_consistency"
          CHECK (
            ("status" = 'PENDING' AND "responded_at" IS NULL AND "accepted_at" IS NULL)
            OR ("status" = 'ACCEPTED' AND "responded_at" IS NOT NULL AND "accepted_at" IS NOT NULL)
            OR ("status" IN ('REJECTED', 'USED') AND "responded_at" IS NOT NULL)
          )
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "parcels"
      ADD COLUMN "invitation_id" uuid,
      ADD CONSTRAINT "fk_parcels_invitation"
        FOREIGN KEY ("invitation_id") REFERENCES "parcel_invitations"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "parcel_invitations"
      ADD CONSTRAINT "fk_parcel_invitations_parcel"
        FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "idx_parcel_invitations_recipient_status" ON "parcel_invitations" ("recipient_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_parcel_invitations_courier_created" ON "parcel_invitations" ("courier_id", "created_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_parcel_invitations_courier_created"`);
    await queryRunner.query(`DROP INDEX "idx_parcel_invitations_recipient_status"`);
    await queryRunner.query(`ALTER TABLE "parcel_invitations" DROP CONSTRAINT "fk_parcel_invitations_parcel"`);
    await queryRunner.query(`ALTER TABLE "parcels" DROP CONSTRAINT "fk_parcels_invitation", DROP COLUMN "invitation_id"`);
    await queryRunner.query(`DROP TABLE "parcel_invitations"`);
  }
}
