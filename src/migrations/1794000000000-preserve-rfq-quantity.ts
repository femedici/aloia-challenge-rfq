import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreserveRfqQuantity1794000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('rfq_item');
    if (table?.findColumnByName('quantity')?.type !== 'integer') return;
    const path = table.name.split('.').map((part) => queryRunner.connection.driver.escape(part)).join('.');
    await queryRunner.query(`ALTER TABLE ${path} ALTER COLUMN "quantity" TYPE double precision USING "quantity"::double precision`);
  }

  async down(): Promise<void> {
    // Fractional invalid inputs are deliberately retained; narrowing would destroy their original values.
    throw new Error('Quantity preservation is irreversible; restore a verified backup to downgrade.');
  }
}
