import { MigrationInterface, QueryRunner } from 'typeorm';

/** Extends the settlement transaction contract to include courier payout requests. */
export class AddCourierPayoutSettlementType1791630000015 implements MigrationInterface {
  name = 'AddCourierPayoutSettlementType1791630000015';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "settlement_transactions" DROP CONSTRAINT "ck_settlement_type"');
    await queryRunner.query(`
      ALTER TABLE "settlement_transactions"
        ADD CONSTRAINT "ck_settlement_type"
        CHECK ("transaction_type" IN ('PAYMENT', 'REFUND', 'HUB_PAYOUT', 'COURIER_PAYOUT', 'HOLD', 'RELEASE'))
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_courier_payout_requests_owner_status"
      ON "settlement_transactions" ("requested_by", "status", "created_at")
      WHERE "transaction_type" = 'COURIER_PAYOUT'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_courier_payout_requests_owner_status"');
    await queryRunner.query(`
      DO $migration$
      BEGIN
        IF EXISTS (SELECT 1 FROM "settlement_transactions" WHERE "transaction_type" = 'COURIER_PAYOUT') THEN
          RAISE EXCEPTION 'Cannot revert courier payout transaction type while courier payout rows exist';
        END IF;
      END
      $migration$
    `);
    await queryRunner.query('ALTER TABLE "settlement_transactions" DROP CONSTRAINT "ck_settlement_type"');
    await queryRunner.query(`
      ALTER TABLE "settlement_transactions"
        ADD CONSTRAINT "ck_settlement_type"
        CHECK ("transaction_type" IN ('PAYMENT', 'REFUND', 'HUB_PAYOUT', 'HOLD', 'RELEASE'))
    `);
  }
}
