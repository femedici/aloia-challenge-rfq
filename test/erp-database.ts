import 'reflect-metadata';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';

config({ quiet: true });

export async function erpTestDatabase(entities: EntityTarget<ObjectLiteral>[]) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for real PostgreSQL ERP tests');
  const schema = `test_erp_${randomUUID().replaceAll('-', '')}`;
  const admin = await new DataSource({ type: 'postgres', url: process.env.DATABASE_URL }).initialize();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const database = new DataSource({
    type: 'postgres', url: process.env.DATABASE_URL, schema,
    extra: { application_name: schema },
    entities: entities as any[], synchronize: true,
  });
  try {
    await database.initialize();
  } catch (error) {
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.destroy();
    throw error;
  }
  return {
    schema,
    database,
    async close() {
      if (database.isInitialized) await database.destroy();
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    },
  };
}
