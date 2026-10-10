import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInAppNotifications1791630000006 implements MigrationInterface {
  name = 'AddInAppNotifications1791630000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "category" varchar(40) NOT NULL,
        "title" varchar(160) NOT NULL,
        "body" text NOT NULL,
        "reference_type" varchar(64),
        "reference_id" uuid,
        "expires_at" timestamptz,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_notifications_user_created" ON "notifications" ("user_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_notifications_reference" ON "notifications" ("reference_type", "reference_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_notifications_reference"`);
    await queryRunner.query(`DROP INDEX "idx_notifications_user_created"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
