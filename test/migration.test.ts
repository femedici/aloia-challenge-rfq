import { DataSource } from 'typeorm';
import { Rfq } from '../src/rfq/rfq.entity';
import { RfqItem } from '../src/rfq/rfq-item.entity';
import { PreserveRfqQuantity1794000000000 } from '../src/migrations/1794000000000-preserve-rfq-quantity';
import { createTestDatabase } from './database';

it('upgrades an existing integer quantity column without replacing populated values', async () => {
  const database = await createTestDatabase();
  const options = { ...database.options, entities: [Rfq, RfqItem] };
  let db = new DataSource(options);
  try {
    await db.initialize();
    const schema = (options as {schema:string}).schema;
    await db.query(`ALTER TABLE "${schema}".rfq_item ALTER COLUMN quantity TYPE integer USING quantity::integer`);
    const repository = db.getRepository(Rfq);
    const original = await repository.save(repository.create({
      rfqId: 'PRESERVED', customerCode: 'C1', customerName: 'Existing customer', items: [
        { lineNumber: 1, rawPartNumber: 'ABC123', partNumber: 'ABC123', quantity: 7,
          rawUnit: 'EA', unit: 'EA', warnings: [], status: 'quoted', supplier: 'Existing supplier',
          unitPriceUsd: '12.34', totalPriceUsd: '86.38' },
      ],
    }));
    await db.destroy();
    db = new DataSource({ ...options, migrations: [PreserveRfqQuantity1794000000000], migrationsRun: true });
    await db.initialize();
    const preserved = await db.getRepository(Rfq).findOneOrFail({ where: { rfqId: 'PRESERVED' }, relations: { items: true } });
    expect(preserved.customerName).toBe('Existing customer');
    expect(preserved.items[0].quantity).toBe(7);
    expect(preserved.id).toBe(original.id);
    expect(preserved.items[0]).toMatchObject({ id: original.items[0].id, supplier: 'Existing supplier', unitPriceUsd: '12.34', totalPriceUsd: '86.38' });
    const migration = new PreserveRfqQuantity1794000000000();
    const runner = db.createQueryRunner();
    await runner.connect();
    try { await expect(migration.up(runner)).resolves.toBeUndefined(); }
    finally { await runner.release(); }
  } finally {
    if (db.isInitialized) await db.destroy();
    await database.cleanup();
  }
});
