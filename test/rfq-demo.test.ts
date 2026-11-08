import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { RfqDemoService } from '../src/rfq/rfq-demo.service';
import { RfqEventRecord } from '../src/rfq/rfq-event.entity';
import { RfqModule } from '../src/rfq/rfq.module';
import { RfqService } from '../src/rfq/rfq.service';
import { Rfq } from '../src/rfq/rfq.entity';
import { RfqSubmission } from '../src/erp/rfq-submission.entity';
import { createTestDatabase } from './database';

jest.setTimeout(20000);
describe('reviewer demo startup', () => {
  let app: INestApplication;
  let db: DataSource;
  let service: RfqService;
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const original = { demo: process.env.DEMO_MODE, round: process.env.DEMO_ROUND, node: process.env.NODE_ENV };
  beforeAll(async () => {
    process.env.DEMO_MODE = 'true';
    delete process.env.DEMO_ROUND;
    process.env.INTERNAL_API_KEY = 'demo-test';
    database = await createTestDatabase();
    const module = await Test.createTestingModule({ imports: [TypeOrmModule.forRoot(database.options), RfqModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false);
    await app.init();
    db = module.get(DataSource); service = module.get(RfqService);
  });
  afterAll(async () => {
    await app?.close(); await database?.cleanup();
    for (const [key, value] of Object.entries({ DEMO_MODE: original.demo, DEMO_ROUND: original.round, NODE_ENV: original.node })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  test.each([
    ['OPEN', 'OPEN', ['pending', 'pending']],
    ['PARTIAL', 'IN_PROGRESS', ['quoted', 'pending', 'pending', 'pending']],
    ['READY', 'READY', ['quoted', 'quoted']],
    ['MIXED', 'READY', ['quoted', 'canceled', 'no_quote']],
    ['CLOSED', 'CLOSED', ['no_quote', 'canceled']],
    ['INVALID', 'INVALID', ['invalid', 'invalid']],
  ])('starts %s with expected items and no ERP submission', async (name, status, items) => {
    const result = await request(app.getHttpServer()).get(`/rfqs/RFQ-DEMO-${name}`).set('x-api-key', 'demo-test');
    expect(result.status).toBe(200);
    expect(result.body.status).toBe(status);
    expect(result.body.items.map((item: {status: string}) => item.status)).toEqual(items);
    expect(result.body.submission.status).toBe('not_sent');
  });
  it('creates no submissions automatically', async () => {
    expect(await db.getRepository(Rfq).count()).toBe(6);
    expect(await db.getRepository(RfqSubmission).count()).toBe(0);
  });
  test.each(['OPEN', 'PARTIAL', 'CLOSED', 'INVALID'])('rejects submitting %s', async name => {
    await request(app.getHttpServer()).post(`/rfqs/RFQ-DEMO-${name}/submit`).set('x-api-key', 'demo-test').expect(409);
  });
  test.each([['READY', 2], ['MIXED', 1]])('allows %s and freezes only quoted items', async (name, count) => {
    const submission = await service.submit(`RFQ-DEMO-${name}`);
    expect(submission.status).toBe('pending');
    const saved = await db.getRepository(RfqSubmission).findOneByOrFail({rfqId: `RFQ-DEMO-${name}`});
    expect(saved.payload.lines).toHaveLength(count as number);
  });
  it('preserves edits and existing submissions on repeated/concurrent startup', async () => {
    await service.noQuote('RFQ-DEMO-OPEN', 1);
    const before = await service.getRfq('RFQ-DEMO-OPEN');
    const submitted = await db.getRepository(RfqSubmission).find();
    const events = await db.getRepository(RfqEventRecord).count();
    await Promise.all(Array.from({length: 3}, () => app.get(RfqDemoService).onApplicationBootstrap()));
    expect(await service.getRfq('RFQ-DEMO-OPEN')).toEqual(before);
    expect(await db.getRepository(RfqSubmission).find()).toEqual(submitted);
    expect(await db.getRepository(RfqEventRecord).count()).toBe(events);
    expect(await db.getRepository(Rfq).count()).toBe(6);
  });
  it('creates a new round once under concurrent starts without resetting old RFQs', async () => {
    process.env.DEMO_ROUND = 'round2';
    await Promise.all(Array.from({length: 3}, () => app.get(RfqDemoService).onApplicationBootstrap()));
    expect(await db.getRepository(Rfq).count()).toBe(12);
    const ready = await service.getRfq('RFQ-DEMO-READY-round2');
    expect(ready.status).toBe('READY');
    expect(ready.submission.status).toBe('not_sent');
    expect(await db.getRepository(RfqSubmission).count()).toBe(2);
    delete process.env.DEMO_ROUND;
  });
  it('does nothing when demo mode is disabled', async () => {
    process.env.DEMO_MODE = 'false'; process.env.DEMO_ROUND = 'disabled';
    await app.get(RfqDemoService).onApplicationBootstrap();
    expect(await db.getRepository(Rfq).count()).toBe(12);
    process.env.DEMO_MODE = 'true'; delete process.env.DEMO_ROUND;
  });
  it('refuses demo mode in production and rejects unsafe round names', async () => {
    process.env.NODE_ENV = 'production';
    await expect(app.get(RfqDemoService).onApplicationBootstrap()).rejects.toThrow('produção');
    process.env.NODE_ENV = 'test'; process.env.DEMO_ROUND = '../bad';
    await expect(app.get(RfqDemoService).onApplicationBootstrap()).rejects.toThrow('DEMO_ROUND');
    delete process.env.DEMO_ROUND;
    expect(await db.getRepository(Rfq).count()).toBe(12);
  });
  it('rolls back the failed scenario and can finish it on retry', async () => {
    process.env.DEMO_ROUND = 'retry';
    const fail = jest.spyOn(RfqService.prototype, 'quoteItem').mockRejectedValueOnce(new Error('demo interruption'));
    try { await expect(app.get(RfqDemoService).onApplicationBootstrap()).rejects.toThrow('demo interruption'); }
    finally { fail.mockRestore(); }
    expect(await db.getRepository(Rfq).existsBy({rfqId: 'RFQ-DEMO-PARTIAL-retry'})).toBe(false);
    expect(await db.getRepository(RfqEventRecord).countBy({rfqId: 'RFQ-DEMO-PARTIAL-retry'})).toBe(0);
    await app.get(RfqDemoService).onApplicationBootstrap();
    expect((await service.getRfq('RFQ-DEMO-PARTIAL-retry')).status).toBe('IN_PROGRESS');
    expect(await db.getRepository(Rfq).count()).toBe(18);
    delete process.env.DEMO_ROUND;
  });

});
