import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { RfqModule } from '../src/rfq/rfq.module';
import { Rfq } from '../src/rfq/rfq.entity';
import { RfqItem } from '../src/rfq/rfq-item.entity';
import { RfqEventRecord } from '../src/rfq/rfq-event.entity';
import { RfqService } from '../src/rfq/rfq.service';
import { createTestDatabase } from './database';

jest.setTimeout(20000);

describe('RFQ event persistence', () => {
  let app: INestApplication;
  let db: DataSource;
  let service: RfqService;
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const key = 'integration-key';
  const secret = 'integration-signature';
  const created = (rfqId: string, eventId = `${rfqId}-created`) => ({
    eventId, type: 'rfq.created', occurredAt: '2026-11-02T15:00:00Z',
    data: { rfqId, customer: { code: 'C-1', name: 'Customer' }, items: [
      { lineNumber: 1, partNumber: 'ABC123', quantity: 3, unit: 'EA' },
      { lineNumber: 2, partNumber: 'DEF456', quantity: 2, unit: 'EA' },
    ] },
  });
  const canceled = (rfqId: string, lineNumber = 1, eventId = `${rfqId}-canceled`) => ({
    eventId, type: 'rfq.item_canceled', occurredAt: '2026-11-02T16:00:00Z',
    data: { rfqId, lineNumber, reason: 'No longer needed' },
  });
  const post = (event: unknown) => {
    const body = JSON.stringify(event);
    return request(app.getHttpServer()).post('/webhooks/rfq').set('x-api-key', key)
      .set('content-type', 'application/json')
      .set('x-signature', `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`).send(body);
  };
  const detail = (rfqId: string) => request(app.getHttpServer()).get(`/rfqs/${rfqId}`).set('x-api-key', key);

  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = key;
    process.env.WEBHOOK_SECRET = secret;
    database = await createTestDatabase();
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(database.options), RfqModule],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.useLogger(['error']);
    await app.listen(0, '127.0.0.1');
    db = module.get(DataSource);
    service = module.get(RfqService);
  });
  afterAll(async () => { await app?.close(); await database?.cleanup(); });

  it('creates one RFQ and one copy of each item from concurrent duplicate events', async () => {
    const event = created('CONCURRENT');
    const results = await Promise.all(Array.from({ length: 10 }, () => post(event)));
    expect(results.map(r => r.status)).toEqual(Array(10).fill(200));
    expect(await db.getRepository(Rfq).countBy({ rfqId: 'CONCURRENT' })).toBe(1);
    expect(await db.getRepository(RfqItem).countBy({ rfq: { rfqId: 'CONCURRENT' } })).toBe(2);
    const records = await db.getRepository(RfqEventRecord).findBy({ rfqId: 'CONCURRENT' });
    expect(records).toHaveLength(1);
    expect(records[0].completedAt).toBeInstanceOf(Date);
    expect(records[0].receivedAt.getTime()).toBeLessThanOrEqual(records[0].completedAt.getTime());
  });

  it('applies cancellation once, acknowledges duplicates and prevents quoting it', async () => {
    await post(created('CANCEL')).expect(200);
    const results = await Promise.all(Array.from({ length: 10 }, () => post(canceled('CANCEL'))));
    expect(results.map(r => r.status)).toEqual(Array(10).fill(200));
    const result = await detail('CANCEL').expect(200);
    expect(result.body.items[0].status).toBe('canceled');
    await request(app.getHttpServer()).put('/rfqs/CANCEL/items/1/quote').set('x-api-key', key)
      .send({ supplier: 'Acme', currency: 'USD', unitCost: '1', moq: 1, marginPercent: '0' }).expect(409);
    await request(app.getHttpServer()).post('/rfqs/CANCEL/items/1/no-quote').set('x-api-key', key).expect(409);
  });

  it('preserves cancellation delivered before creation', async () => {
    await post(canceled('EARLY')).expect(200);
    await post(created('EARLY')).expect(200);
    expect((await detail('EARLY')).body.items[0].status).toBe('canceled');
    expect((await detail('EARLY')).body.items[1].status).toBe('pending');
  });

  it('ignores later creation with another eventId and never revives canceled items', async () => {
    await post(created('RESEND')).expect(200);
    await post(canceled('RESEND')).expect(200);
    const resend = created('RESEND', 'new-delivery');
    resend.data.customer.name = 'Changed';
    await post(resend).expect(200);
    const result = await detail('RESEND');
    expect(result.body.customerName).toBe('Customer');
    expect(result.body.items[0].status).toBe('canceled');
  });

  it('uses the shared status rule for a pending and an invalid line', async () => {
    const event = created('STATUS');
    event.data.items[1].partNumber = '!';
    await post(event).expect(200);
    const list = await request(app.getHttpServer()).get('/rfqs').set('x-api-key', key).expect(200);
    expect(list.body.find(r => r.rfqId === 'STATUS').status).toBe('OPEN');
    expect((await detail('STATUS')).body.status).toBe('OPEN');
  });
  it('serializes item edits with webhook processing for the same RFQ', async () => {
    await post(created('LOCKED')).expect(200);
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['rfq:LOCKED']);
    let completed = false;
    const edit = request(app.getHttpServer()).post('/rfqs/LOCKED/items/1/no-quote')
      .set('x-api-key', key).then(response => { completed = true; return response; });
    try {
      await runner.query('SELECT pg_sleep(0.15)');
      expect(completed).toBe(false);
    } finally {
      await runner.commitTransaction();
      await runner.release();
      await edit;
    }
    expect((await detail('LOCKED')).body.items[0].status).toBe('no_quote');
  });

  it('does not create another RFQ when an eventId is reused with different data', async () => {
    await post(created('GLOBAL-A', 'global-event')).expect(200);
    await post(created('GLOBAL-B', 'global-event')).expect(200);
    expect(await db.getRepository(Rfq).countBy({ rfqId: 'GLOBAL-B' })).toBe(0);
  });

  it('serializes different creation events for the same RFQ', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => post(created('BUSINESS-ID', `business-${i}`)).expect(200)));
    expect(await db.getRepository(Rfq).countBy({ rfqId: 'BUSINESS-ID' })).toBe(1);
    expect(await db.getRepository(RfqEventRecord).countBy({ rfqId: 'BUSINESS-ID' })).toBe(10);
  });

  it('rolls back the event claim when a database mutation fails, allowing redelivery', async () => {
    const invalid = created('ROLLBACK');
    invalid.data.items[1].lineNumber = 1;
    await expect(service.processEvent(invalid as any)).rejects.toThrow();
    expect(await db.getRepository(RfqEventRecord).countBy({ eventId: invalid.eventId })).toBe(0);
    expect(await db.getRepository(Rfq).countBy({ rfqId: 'ROLLBACK' })).toBe(0);
    await post(created('ROLLBACK')).expect(200);
  });

  it('keeps invalid items final and preserves fractional quantity as received', async () => {
    const invalid = created('INVALID');
    invalid.data.items[0].quantity = 1.5;
    await post(invalid).expect(200);
    await post(canceled('INVALID')).expect(200);
    const result = await detail('INVALID');
    expect(result.body.items[0]).toMatchObject({ quantity: 1.5, status: 'invalid', invalidReason: 'invalid_quantity' });
  });

  it('chooses cancellation reason deterministically across delivery order', async () => {
    await post(created('REASONS')).expect(200);
    const later = canceled('REASONS', 1, 'later');
    later.data.reason = 'Later reason';
    await post(later).expect(200);
    const earlier = canceled('REASONS', 1, 'earlier');
    earlier.occurredAt = '2026-11-02T15:30:00Z';
    earlier.data.reason = 'Earlier reason';
    await post(earlier).expect(200);
    expect((await detail('REASONS')).body.items[0].cancellationReason).toBe('Earlier reason');
  });

});
