import { MigrationInterface, QueryRunner } from 'typeorm';

/** Enforce uniqueness of completed provider-confirmed payment references. */
export class UniqueCompletedPaymentProviderReference1791630000002 implements MigrationInterface {
  name = 'UniqueCompletedPaymentProviderReference1791630000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_settlement_completed_payment_provider_reference"
      ON "settlement_transactions" ("provider_reference")
      WHERE "transaction_type" = 'PAYMENT'
        AND "status" = 'COMPLETED'
        AND "provider_reference" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "uq_settlement_completed_payment_provider_reference"');
  }
}
