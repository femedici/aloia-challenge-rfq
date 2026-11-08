import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { RfqModule } from '../src/rfq/rfq.module';
import { RfqSubmission } from '../src/erp/rfq-submission.entity';
import { ErpSubmissionWorker } from '../src/erp/erp-submission.worker';
import { RfqService } from '../src/rfq/rfq.service';
import { RfqItem } from '../src/rfq/rfq-item.entity';
import { createTestDatabase } from './database';

jest.setTimeout(20000);
const quote = { supplier: 'Acme', currency: 'EUR', unitCost: '10.10', moq: 5, freight: '25.00', customs: '7.35', marginPercent: '18.5' };

describe('RFQ API and submission integration', () => {
  let app: INestApplication;
  let db: DataSource;
  let service: RfqService;
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const call = (method: string, url: string) => request(app.getHttpServer())[method](url).set('x-api-key', 'api-test');
  const event = (rfqId: string, items = [{ lineNumber: 1, partNumber: 'ABC123', quantity: 3, unit: 'EA' }] as any[]) => ({
    eventId: `${rfqId}-created`, type: 'rfq.created', occurredAt: '2026-11-02T15:00:00Z',
    data: { rfqId, customer: { code: 'C1', name: 'Customer' }, items },
  });
  const post = (value: unknown) => {
    const body = JSON.stringify(value);
    return call('post', '/webhooks/rfq').set('content-type', 'application/json')
      .set('x-signature', `sha256=${createHmac('sha256', 'api-signature').update(body).digest('hex')}`).send(body);
  };
  const ready = async (id: string) => {
    await post(event(id)).expect(200);
    await call('put', `/rfqs/${id}/items/1/quote`).send(quote).expect(200);
  };
  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = 'api-test';
    process.env.WEBHOOK_SECRET = 'api-signature';
    database = await createTestDatabase();
    const module = await Test.createTestingModule({ imports: [TypeOrmModule.forRoot(database.options), RfqModule,
      TypeOrmModule.forFeature([RfqSubmission])] }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.useLogger(false);
    await app.listen(0, '127.0.0.1');
    db = module.get(DataSource);
    service = module.get(RfqService);
  });
  afterAll(async () => { await app?.close(); await database?.cleanup(); });

  it('persists exact prices and clears optional charges on re-quote', async () => {
    await ready('PRICE');
    let detail = (await call('get', '/rfqs/PRICE').expect(200)).body;
    expect(detail.items[0]).toMatchObject({ unitPriceUsd: '35.51', totalPriceUsd: '106.53' });
    await call('put', '/rfqs/PRICE/items/1/quote').send({ supplier: 'B', currency: 'USD', unitCost: '1.005', moq: 0, marginPercent: '0' }).expect(200);
    detail = (await call('get', '/rfqs/PRICE').expect(200)).body;
    expect(detail.items[0]).toMatchObject({ unitPriceUsd: '1.01', totalPriceUsd: '3.03', freight: '0', customs: '0', otherCharges: '0' });
    expect(detail.submission.status).toBe('not_sent');
  });

  it('preserves originals, normalizes duplicates, blacklist and calendar dates', async () => {
    await post(event('NORMAL', [
      { lineNumber: 2, partNumber: ' ab-2231/04 ', quantity: 3, unit: 'ea', requiredBy: '02/29/2024' },
      { lineNumber: 1, partNumber: 'AB223104', quantity: 3, unit: 'EA', requiredBy: '' },
      { lineNumber: 3, partNumber: 'BAD-001', quantity: 1, unit: 'EA', requiredBy: '2026-02-30' },
    ])).expect(200);
    const { items } = (await call('get', '/rfqs/NORMAL')).body;
    expect(items[0]).toMatchObject({ requiredBy: null, warnings: ['invalid_required_by'] });
    expect(items[1]).toMatchObject({ rawPartNumber: ' ab-2231/04 ', partNumber: 'AB223104', rawUnit: 'ea', requiredBy: '2024-02-29', warnings: ['possible_duplicate:1'] });
    expect(items[2]).toMatchObject({ requiredBy: null, warnings: ['invalid_required_by'] });
  });

  test.each([null, {}, { ...event('BAD'), data: {} }, { ...event('BAD'), data: { ...event('BAD').data, items: [{ lineNumber: 1 }] } }])('rejects malformed webhook %j with 400', async value => {
    await post(value).expect(400);
  });
  test.each([{ ...quote, supplier: '' }, { ...quote, unitCost: '-1' }, { ...quote, currency: 'XYZ' }, { ...quote, moq: 1.2 }, { ...quote, freight: null }])('rejects malformed quote %j with 400', async value => {
    await call('put', '/rfqs/PRICE/items/1/quote').send(value).expect(400);
  });
  test.each(['page=0', 'page=-1', 'pageSize=0', 'pageSize=101', 'page=abc', 'page=1.5'])('rejects bad pagination %s', async query => {
    await call('get', `/rfqs?${query}`).expect(400);
  });
  it('returns disjoint pages and clear not found responses', async () => {
    const first = await call('get', '/rfqs?page=1&pageSize=1').expect(200);
    const second = await call('get', '/rfqs?page=2&pageSize=1').expect(200);
    expect(first.body).toHaveLength(1);
    expect(second.body).toHaveLength(1);
    expect(first.body[0].rfqId).not.toBe(second.body[0].rfqId);
    await call('get', '/rfqs/MISSING').expect(404);
    await call('put', '/rfqs/PRICE/items/99/quote').send(quote).expect(404);
    await call('post', '/rfqs/MISSING/submit').expect(404);
  });
  test.each([
    [['invalid'], 'INVALID'], [['pending', 'invalid'], 'OPEN'], [['pending', 'canceled'], 'IN_PROGRESS'],
    [['quoted', 'no_quote', 'invalid'], 'READY'], [['canceled', 'no_quote'], 'CLOSED'],
  ])('derives %j as %s', (statuses: string[], expected: string) => {
    expect(service.deriveStatus(statuses.map(status => ({ status })) as RfqItem[])).toBe(expected);
  });

  it('rejects every non-READY RFQ and accepts only quoted lines in the immutable payload', async () => {
    await post(event('FILTER', [
      { lineNumber: 1, partNumber: 'ABC123', quantity: 3, unit: 'EA' },
      { lineNumber: 2, partNumber: 'DEF456', quantity: 2, unit: 'EA' },
      { lineNumber: 3, partNumber: 'GHI789', quantity: 1, unit: 'EA' },
      { lineNumber: 4, partNumber: '!', quantity: 1, unit: 'EA' },
    ])).expect(200);
    await call('post', '/rfqs/FILTER/submit').expect(409);
    await call('put', '/rfqs/FILTER/items/1/quote').send(quote).expect(200);
    await call('post', '/rfqs/FILTER/submit').expect(409);
    await call('post', '/rfqs/FILTER/items/2/no-quote').expect(201);
    await post({ eventId: 'FILTER-cancel', type: 'rfq.item_canceled', occurredAt: '2026-11-02T16:00:00Z', data: { rfqId: 'FILTER', lineNumber: 3, reason: 'Canceled' } }).expect(200);
    await call('post', '/rfqs/FILTER/submit').expect(202);
    const submission = await db.getRepository(RfqSubmission).findOneByOrFail({ rfqId: 'FILTER' });
    expect(submission.payload).toEqual({ externalId: 'FILTER', customerCode: 'C1', currency: 'USD', lines: [
      { lineNumber: 1, partNumber: 'ABC123', quantity: 3, unit: 'EA', unitPrice: '35.51' },
    ] });
    expect((await call('get', '/rfqs/FILTER')).body.items).toHaveLength(4);
    await call('put', '/rfqs/FILTER/items/1/quote').send(quote).expect(409);
    await call('post', '/rfqs/FILTER/items/1/no-quote').expect(409);
  });
  it('serializes simultaneous submits and sends one order across repeated worker calls', async () => {
    await ready('SUBMIT');
    const responses = await Promise.all(Array.from({ length: 10 }, () => call('post', '/rfqs/SUBMIT/submit')));
    expect(responses.map(response => response.status)).toEqual(Array(10).fill(202));
    expect(await db.getRepository(RfqSubmission).countBy({ rfqId: 'SUBMIT' })).toBe(1);
    const orders = new Map<string, { id: string; externalId: string }>();
    const createOrder = jest.fn(async payload => { const receipt = { id: `ERP-${payload.externalId}`, externalId: payload.externalId }; orders.set(payload.externalId, receipt); return receipt; });
    const client = { findOrders: async id => orders.has(id) ? [orders.get(id)] : [], createOrder };
    const workers = [new ErpSubmissionWorker(db, client as any), new ErpSubmissionWorker(db, client as any)];
    await Promise.all(workers.map(worker => worker.runOnce()));
    await workers[0].runOnce();
    expect(createOrder.mock.calls.filter(([payload]) => payload.externalId === 'SUBMIT')).toHaveLength(1);
    const response = await call('post', '/rfqs/SUBMIT/submit').expect(200);
    expect(response.body).toMatchObject({ status: 'sent', erpOrderId: 'ERP-SUBMIT', attempts: 1 });
    expect((await call('get', '/rfqs/SUBMIT')).body.submission).toMatchObject({ status: 'sent', erpOrderId: 'ERP-SUBMIT' });
    await post({ eventId: 'SUBMIT-late', type: 'rfq.item_canceled', occurredAt: '2026-11-02T17:00:00Z', data: { rfqId: 'SUBMIT', lineNumber: 1, reason: 'Late cancellation' } }).expect(200);
    await call('post', '/rfqs/SUBMIT/submit').expect(200);
    expect((await db.getRepository(RfqSubmission).findOneByOrFail({ rfqId: 'SUBMIT' })).payload.lines).toHaveLength(1);
  });
  it('returns permanent failure without creating another submission', async () => {
    await ready('FAILURE');
    await call('post', '/rfqs/FAILURE/submit').expect(202);
    await db.getRepository(RfqSubmission).update('FAILURE', { status: 'failed', lastError: 'ERP 422: invalid customer', completedAt: new Date() });
    const result = await call('post', '/rfqs/FAILURE/submit').expect(200);
    expect(result.body).toMatchObject({ status: 'failed', lastError: 'ERP 422: invalid customer' });
    expect(await db.getRepository(RfqSubmission).countBy({ rfqId: 'FAILURE' })).toBe(1);
    await call('put', '/rfqs/FAILURE/items/99/quote').send(quote).expect(404);
    await call('post', '/rfqs/FAILURE/items/99/no-quote').expect(404);
  });

  test.each(['0', '-1', '2147483648', '9007199254740992'])('rejects out-of-range item route %s before database access', async line => {
    await call('put', `/rfqs/PRICE/items/${line}/quote`).send(quote).expect(400);
    await call('post', `/rfqs/PRICE/items/${line}/no-quote`).expect(400);
  });

  it('keeps invalid units and blacklisted parts final, and rejects INVALID/CLOSED submits', async () => {
    await post(event('BAD-UNIT', [{ lineNumber: 1, partNumber: 'ABC123', quantity: 1, unit: 'UNKNOWN' }])).expect(200);
    await post(event('BLACKLIST', [{ lineNumber: 1, partNumber: ' zx/9000.01 ', quantity: 1, unit: 'EA' }])).expect(200);
    for (const [id, state, itemState] of [['BAD-UNIT', 'INVALID', 'invalid'], ['BLACKLIST', 'CLOSED', 'no_quote']]) {
      const result = (await call('get', `/rfqs/${id}`).expect(200)).body;
      expect(result.status).toBe(state);
      expect(result.items[0].status).toBe(itemState);
      await call('post', `/rfqs/${id}/submit`).expect(409);
      await call('put', `/rfqs/${id}/items/1/quote`).send(quote).expect(409);
      await call('post', `/rfqs/${id}/items/1/no-quote`).expect(409);
    }
  });

  it('shares the RFQ transaction lock between submission and quotation edits', async () => {
    await ready('SNAPSHOT-LOCK');
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['rfq:SNAPSHOT-LOCK']);
    let finished = false;
    const submit = call('post', '/rfqs/SNAPSHOT-LOCK/submit').then(response => { finished = true; return response; });
    try {
      await runner.query('SELECT pg_sleep(0.1)');
      expect(finished).toBe(false);
      const edit = call('put', '/rfqs/SNAPSHOT-LOCK/items/1/quote').send({ ...quote, unitCost: '999' }).then(response => response);
      await runner.query('SELECT pg_sleep(0.1)');
      await runner.commitTransaction();
      expect((await submit).status).toBe(202);
      expect((await edit).status).toBe(409);
      const snapshot = await db.getRepository(RfqSubmission).findOneByOrFail({ rfqId: 'SNAPSHOT-LOCK' });
      expect(snapshot.payload.lines[0].unitPrice).toBe('35.51');
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      await submit;
    }
  });
});
