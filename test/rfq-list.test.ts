import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, EntitySubscriberInterface } from 'typeorm';
import { RfqModule } from '../src/rfq/rfq.module';
import { RfqService, RfqStatus } from '../src/rfq/rfq.service';
import { Rfq } from '../src/rfq/rfq.entity';
import { ItemStatus, RfqItem } from '../src/rfq/rfq-item.entity';
import { RfqSubmission, SubmissionStatus } from '../src/erp/rfq-submission.entity';
import { createTestDatabase } from './database';

describe('global RFQ list filtering and ordering', () => {
  let app: INestApplication;
  let db: DataSource;
  let service: RfqService;
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const originalKey = process.env.INTERNAL_API_KEY;
  const get = (query = '') => request(app.getHttpServer()).get(`/rfqs${query ? `?${query}` : ''}`).set('x-api-key', 'list-api-test');

  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = 'list-api-test';
    database = await createTestDatabase();
    const module = await Test.createTestingModule({ imports: [TypeOrmModule.forRoot(database.options), RfqModule] }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
    db = module.get(DataSource);
    service = module.get(RfqService);
  });

  afterAll(async () => {
    await app?.close();
    await database?.cleanup();
    if (originalKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = originalKey;
  });

  async function seed(rfqId: string, statuses: ItemStatus[] = ['pending'], values: Partial<Rfq> = {}, submissionStatus?: SubmissionStatus) {
    const repository = db.getRepository(Rfq);
    const rfq = await repository.save(repository.create({
      rfqId, customerName: 'Default customer', customerCode: 'CUSTOMER-1',
      createdAt: new Date('2026-01-01T00:00:00Z'), ...values,
      items: statuses.map((status, index) => db.getRepository(RfqItem).create({
        lineNumber: index + 1, rawPartNumber: 'ABC123', partNumber: 'ABC123',
        quantity: 1, rawUnit: 'EA', unit: 'EA', status, warnings: [],
      })),
    }));
    if (submissionStatus) {
      await db.getRepository(RfqSubmission).insert({
        rfqId, status: submissionStatus,
        payload: { externalId: rfqId, customerCode: rfq.customerCode, currency: 'USD', lines: [] },
      });
    }
    return rfq;
  }

  it('filters all RFQs before pagination, combines filters, and matches customer name or code', async () => {
    for (let i = 0; i < 24; i++) await seed(`PAGE-NOISE-${String(i).padStart(2, '0')}`, ['pending'], { createdAt: new Date('2026-02-01T00:00:00Z') });
    await seed('PAGE-TARGET-A', ['quoted', 'invalid'], { customerName: 'Northwind Cargo', customerCode: 'NX-42' });
    await seed('PAGE-TARGET-B', ['quoted', 'canceled'], { customerName: 'NORTHWIND Cargo', customerCode: 'NX-43' });
    await seed('PAGE-TARGET-OPEN', ['pending'], { customerName: 'Northwind Cargo' });

    const first = await get('rfq=page-target&customer=northwind&status=READY&pageSize=1&sortBy=rfqId&sortDirection=asc').expect(200);
    const second = await get('rfq=page-target&customer=northwind&status=READY&pageSize=1&page=2&sortBy=rfqId&sortDirection=asc').expect(200);
    expect(first.body.map((row: any) => row.rfqId)).toEqual(['PAGE-TARGET-A']);
    expect(second.body.map((row: any) => row.rfqId)).toEqual(['PAGE-TARGET-B']);
    expect((await get('rfq=PAGE-TARGET&customer=nx-42').expect(200)).body.map((row: any) => row.rfqId)).toEqual(['PAGE-TARGET-A']);
    expect((await get('rfq=PAGE-TARGET&customer=missing').expect(200)).body).toEqual([]);
  });

  it('treats SQL wildcard characters and quotes as literal search text', async () => {
    const literal = "LITERAL-%_\\'";
    await seed(literal, ['pending'], { customerName: 'Customer %_\\ example' });
    await seed('LITERAL-OTHER', ['pending'], { customerName: 'Customer regular example' });
    for (const query of [new URLSearchParams({ rfq: literal }), new URLSearchParams({ customer: '%_\\' })]) {
      expect((await get(query.toString()).expect(200)).body.map((row: any) => row.rfqId)).toEqual([literal]);
    }
    expect((await get(new URLSearchParams({ rfq: "' OR 1=1 --" }).toString()).expect(200)).body).toEqual([]);
  });

  it('returns quote and ERP status separately, including every submission state', async () => {
    await seed('STATE-NONE', ['quoted']);
    for (const status of ['pending', 'sending', 'retry_wait', 'reconciling', 'sent', 'failed'] as const) {
      await seed(`STATE-${status}`, ['canceled', 'no_quote', 'invalid'], {}, status);
    }
    const rows = (await get('rfq=STATE-&pageSize=100').expect(200)).body;
    expect(rows).toHaveLength(7);
    expect(rows.find((row: any) => row.rfqId === 'STATE-NONE')).toMatchObject({ status: 'READY', submissionStatus: 'not_sent' });
    for (const status of ['pending', 'sending', 'retry_wait', 'reconciling', 'sent', 'failed']) {
      expect(rows.find((row: any) => row.rfqId === `STATE-${status}`)).toMatchObject({ status: 'CLOSED', submissionStatus: status, itemCount: 3 });
    }
  });

  it('sorts every supported column across the full result before taking a page', async () => {
    await seed('SORT-A', ['pending'], { customerName: 'Zulu', createdAt: new Date('2026-01-03T00:00:00Z') }, 'sent');
    await seed('SORT-B', Array(10).fill('quoted'), { customerName: 'Alpha', createdAt: new Date('2026-01-01T00:00:00Z') }, 'failed');
    await seed('SORT-C', ['no_quote', 'canceled'], { customerName: 'Mike', createdAt: new Date('2026-01-02T00:00:00Z') });
    const ascending = {
      rfqId: ['SORT-A', 'SORT-B', 'SORT-C'],
      customerName: ['SORT-B', 'SORT-C', 'SORT-A'],
      itemCount: ['SORT-A', 'SORT-C', 'SORT-B'],
      status: ['SORT-C', 'SORT-A', 'SORT-B'],
      submissionStatus: ['SORT-B', 'SORT-C', 'SORT-A'],
      createdAt: ['SORT-B', 'SORT-C', 'SORT-A'],
    };
    for (const [sortBy, ids] of Object.entries(ascending)) {
      for (const direction of ['asc', 'desc']) {
        const expected = direction === 'asc' ? ids : [...ids].reverse();
        const all = await get(`rfq=SORT-&sortBy=${sortBy}&sortDirection=${direction}`).expect(200);
        expect(all.body.map((row: any) => row.rfqId)).toEqual(expected);
        const page = await get(`rfq=SORT-&sortBy=${sortBy}&sortDirection=${direction}&page=2&pageSize=1`).expect(200);
        expect(page.body.map((row: any) => row.rfqId)).toEqual([expected[1]]);
      }
    }
  });

  it('preserves newest-first defaults and a stable RFQ tie-break across pages', async () => {
    await seed('TIE-B');
    await seed('TIE-A');
    await seed('TIE-NEW', ['pending'], { createdAt: new Date('2026-02-01T00:00:00Z') });
    expect((await get('rfq=TIE-').expect(200)).body.map((row: any) => row.rfqId)).toEqual(['TIE-NEW', 'TIE-A', 'TIE-B']);
    const first = (await get('rfq=TIE-&sortBy=itemCount&sortDirection=desc&pageSize=1').expect(200)).body;
    const second = (await get('rfq=TIE-&sortBy=itemCount&sortDirection=desc&pageSize=1&page=2').expect(200)).body;
    expect([first[0].rfqId, second[0].rfqId]).toEqual(['TIE-A', 'TIE-B']);
  });

  it.each([
    'status=unknown', 'status=ready', 'sortBy=unknown', 'sortBy=constructor',
    'sortBy=rfqId%20DESC%3BDROP%20TABLE%20rfq', 'sortDirection=sideways', 'sortDirection=ASC',
    'rfq=one&rfq=two', 'customer=one&customer=two', 'status=OPEN&status=READY',
    'sortBy=rfqId&sortBy=status', 'sortDirection=asc&sortDirection=desc',
    `rfq=${'a'.repeat(201)}`, `customer=${'a'.repeat(201)}`, 'rfq=%00', 'customer=%00',
  ])('rejects invalid query %s', async (query) => {
    await get(query).expect(400);
  });

  it('trims textual filters and ignores empty filters', async () => {
    await seed('TRIM-ONE', ['pending'], { customerName: 'Trim customer' });
    const result = await get(new URLSearchParams({ rfq: ' TRIM-ONE ', customer: '  ', status: '' }).toString()).expect(200);
    expect(result.body.map((row: any) => row.rfqId)).toEqual(['TRIM-ONE']);
  });

  it('uses one snapshot when quotation and submission change between page selection and item loading', async () => {
    const rfq = await seed('SNAPSHOT-ONE');
    let changed = false;
    const concurrentEdit: EntitySubscriberInterface = {
      async afterQuery(event) {
        if (changed || !event.success || !event.query.includes('AS "quoteStatus"') || !event.parameters?.includes('%SNAPSHOT-%')) return;
        changed = true;
        // A separate database session commits real changes after the page query, before hydration.
        await db.transaction(async (manager) => {
          await manager.getRepository(RfqItem).update(rfq.items[0].id, { status: 'quoted' });
          await manager.getRepository(RfqSubmission).insert({
            rfqId: rfq.rfqId, status: 'pending',
            payload: { externalId: rfq.rfqId, customerCode: rfq.customerCode, currency: 'USD', lines: [] },
          });
        });
      },
    };
    db.subscribers.push(concurrentEdit);
    try {
      const response = await get('rfq=SNAPSHOT-&status=OPEN').expect(200);
      expect(changed).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ rfqId: rfq.rfqId, status: 'OPEN', submissionStatus: 'not_sent' });
    } finally {
      db.subscribers.splice(db.subscribers.indexOf(concurrentEdit), 1);
    }
    const current = (await get('rfq=SNAPSHOT-').expect(200)).body;
    expect(current[0]).toMatchObject({ status: 'READY', submissionStatus: 'pending' });
  });

  it('keeps SQL filters and ordering in parity with the domain rule and detail for every status combination', async () => {
    const statuses: ItemStatus[] = ['invalid', 'pending', 'quoted', 'no_quote', 'canceled'];
    const expected = new Map<string, RfqStatus>();
    for (let mask = 0; mask < 32; mask++) {
      const combination = statuses.filter((_, index) => (mask & 1 << index) !== 0);
      const id = `PARITY-${String(mask).padStart(2, '0')}`;
      const row = await seed(id, combination);
      expected.set(id, service.deriveStatus(row.items));
    }
    const doubled = await seed('PARITY-REPEATED', ['pending', 'pending', 'invalid', 'invalid']);
    expected.set(doubled.rfqId, service.deriveStatus(doubled.items));
    for (const status of ['INVALID', 'OPEN', 'IN_PROGRESS', 'READY', 'CLOSED']) {
      const rows = (await get(`rfq=PARITY-&status=${status}&pageSize=100&sortBy=rfqId&sortDirection=asc`).expect(200)).body;
      expect(rows.map((row: any) => row.rfqId)).toEqual([...expected].filter(([, value]) => value === status).map(([id]) => id));
      for (const row of rows) {
        const detail = await request(app.getHttpServer()).get(`/rfqs/${row.rfqId}`).set('x-api-key', 'list-api-test').expect(200);
        expect(row.status).toBe(detail.body.status);
        expect(row.status).toBe(status);
      }
    }
    const sorted = (await get('rfq=PARITY-&pageSize=100&sortBy=status&sortDirection=asc').expect(200)).body;
    expect(sorted.map((row: any) => row.status)).toEqual([...expected.values()].sort());
  });
});
