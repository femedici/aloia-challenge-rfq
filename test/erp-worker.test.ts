import { createServer, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ErpClient, ErpOrder } from '../src/erp/erp.client';
import { RfqSubmission } from '../src/erp/rfq-submission.entity';
import { ErpModule } from '../src/erp/erp.module';
import { ErpSubmissionWorker } from '../src/erp/erp-submission.worker';
import { erpTestDatabase } from './erp-database';

Logger.overrideLogger(false);

const payload: ErpOrder = {
  externalId: 'RFQ-1', customerCode: 'C-1', currency: 'USD',
  lines: [{ lineNumber: 1, partNumber: 'AB123', quantity: 2, unit: 'EA', unitPrice: '35.51' }],
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('durable ERP submissions', () => {
  it('registers the worker with the existing Nest ERP module', () => {
    const providers = Reflect.getMetadata('providers', ErpModule);
    expect(providers.map((provider: any) => provider.name)).toContain('ErpSubmissionWorker');
  });
  it('persists the immutable RFQ identity and pending defaults', async () => {
    const db = await erpTestDatabase([RfqSubmission]);
    try {
      const payload: ErpOrder = { externalId: 'RFQ-1', customerCode: 'C-1', currency: 'USD', lines: [] };
      const repository = db.database.getRepository(RfqSubmission);
      await repository.insert({ rfqId: 'RFQ-1', payload });
      expect(await repository.findOneByOrFail({ rfqId: 'RFQ-1' })).toMatchObject({
        rfqId: 'RFQ-1', payload, status: 'pending', attempts: 0, nextAttemptAt: null,
        startedAt: null, completedAt: null, erpOrderId: null, lastError: null,
      });
      await expect(repository.insert({ rfqId: 'RFQ-1', payload })).rejects.toMatchObject({ code: '23505' });
    } finally {
      await db.close();
    }
  });
});

describe('ERP delivery worker with real PostgreSQL and HTTP', () => {
  let database: DataSource;
  let schema: string;
  let repository: Repository<RfqSubmission>;
  let closeDatabase: () => Promise<void>;
  let server: Server;
  let workers: ErpSubmissionWorker[];
  let orders: { id: string; externalId: string }[];
  let posted: ErpOrder[];
  let lookups: number;
  let lookupStatus: number;
  let lookupBody: unknown;
  let postStatus: number;
  let postBody: unknown;
  let retryAfter: string;
  let postHandler: ((res: ServerResponse) => Promise<void> | void) | undefined;
  const originalUrl = process.env.ERP_BASE_URL;
  const originalToken = process.env.ERP_API_TOKEN;

  beforeEach(async () => {
    const db = await erpTestDatabase([RfqSubmission]);
    database = db.database;
    schema = db.schema;
    closeDatabase = db.close;
    repository = database.getRepository(RfqSubmission);
    workers = [];
    orders = [];
    posted = [];
    lookups = 0;
    lookupStatus = 200;
    postStatus = 201;
    lookupBody = undefined;
    postBody = undefined;
    retryAfter = '2';
    postHandler = undefined;
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      if (req.method === 'GET') {
        lookups++;
        res.writeHead(lookupStatus, { 'content-type': 'application/json' });
        res.end(JSON.stringify(lookupBody ?? { orders }));
        return;
      }
      posted.push(JSON.parse(body));
      if (postHandler) { await postHandler(res); return; }
      if (postStatus === 201) orders.push({ id: `SO-${orders.length + 1}`, externalId: JSON.parse(body).externalId });
      res.writeHead(postStatus, { 'content-type': 'application/json', 'retry-after': retryAfter });
      res.end(JSON.stringify(postBody ?? (postStatus === 201 ? orders.at(-1) : { error: 'ERP rejected', details: ['quantity must be positive'] })));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    process.env.ERP_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.ERP_API_TOKEN = 'test-token';
  });

  afterEach(async () => {
    await Promise.all(workers.map((worker) => worker.onApplicationShutdown()));
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await closeDatabase();
    if (originalUrl === undefined) delete process.env.ERP_BASE_URL;
    else process.env.ERP_BASE_URL = originalUrl;
    if (originalToken === undefined) delete process.env.ERP_API_TOKEN;
    else process.env.ERP_API_TOKEN = originalToken;
  });

  function worker() {
    const instance = new ErpSubmissionWorker(database, new ErpClient());
    workers.push(instance);
    return instance;
  }

  async function seed(values: Partial<RfqSubmission> = {}) {
    await repository.insert({ rfqId: payload.externalId, payload, ...values });
  }

  async function current() { return repository.findOneByOrFail({ rfqId: payload.externalId }); }
  async function due() { await repository.update(payload.externalId, { nextAttemptAt: new Date(0) }); }

  it('commits sending before POST and excludes a second worker with a database session lock', async () => {
    await seed({ payload: { ...payload, externalId: 'stale-payload-id' } });
    const entered = deferred();
    const finish = deferred();
    postHandler = async (res) => {
      entered.resolve();
      await finish.promise;
      orders.push({ id: 'SO-1', externalId: payload.externalId });
      res.end(JSON.stringify(orders[0]));
    };
    const first = worker();
    const second = worker();
    const active = first.runOnce();
    try {
      await entered.promise;
      expect(await current()).toMatchObject({ status: 'sending', attempts: 1 });
      expect((await current()).startedAt).toBeInstanceOf(Date);
      await second.runOnce();
      expect(posted).toEqual([payload]);
    } finally {
      finish.resolve();
      await active;
    }
    expect(await current()).toMatchObject({ status: 'sent', erpOrderId: 'SO-1', nextAttemptAt: null, lastError: null });
    expect((await current()).completedAt).toBeInstanceOf(Date);
    await Promise.all(Array.from({ length: 10 }, () => second.runOnce()));
    expect(posted).toHaveLength(1);
  });

  it('reconciles a preexisting order without posting', async () => {
    await seed();
    orders.push({ id: 'SO-existing', externalId: payload.externalId });
    await worker().runOnce();
    expect(await current()).toMatchObject({ status: 'sent', attempts: 0, erpOrderId: 'SO-existing' });
    expect((await current()).startedAt).toBeInstanceOf(Date);
    expect(posted).toHaveLength(0);
  });

  it('fails safely when lookup finds multiple orders', async () => {
    await seed();
    orders.push({ id: 'SO-1', externalId: payload.externalId }, { id: 'SO-2', externalId: payload.externalId });
    await worker().runOnce();
    expect(await current()).toMatchObject({ status: 'failed', lastError: expect.stringContaining('multiple') });
    expect(posted).toHaveLength(0);
  });

  it.each([400, 401, 422])('records permanent POST %s without retries', async (status) => {
    await seed();
    postStatus = status;
    const instance = worker();
    await instance.runOnce();
    await due();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'failed', attempts: 1, lastError: expect.stringContaining(String(status)) });
    expect((await current()).completedAt).toBeInstanceOf(Date);
    expect(posted).toHaveLength(1);
  });

  it.each([400, 401, 422])('records permanent preflight lookup %s without posting or retrying', async (status) => {
    await seed();
    lookupStatus = status;
    const instance = worker();
    await instance.runOnce();
    expect(await current()).toMatchObject({
      status: 'failed', attempts: 0, erpOrderId: null, nextAttemptAt: null,
      lastError: expect.stringContaining(String(status)),
    });
    expect((await current()).completedAt).toBeInstanceOf(Date);
    lookupStatus = 200;
    await due();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'failed', attempts: 0 });
    expect(lookups).toBe(1);
    expect(posted).toHaveLength(0);
  });

  it.each([429, 503])('reschedules explicit no-write POST %s and sends safely when due', async (status) => {
    await seed();
    postStatus = status;
    const before = Date.now();
    const instance = worker();
    await instance.runOnce();
    const waiting = await current();
    expect(waiting).toMatchObject({ status: 'retry_wait', attempts: 1, completedAt: null });
    expect(waiting.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(before + (status === 429 ? 2_000 : 1_000));
    await instance.runOnce();
    expect(posted).toHaveLength(1);
    await due();
    postStatus = 201;
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'sent', attempts: 2 });
    expect(orders).toHaveLength(1);
  });

  it('keeps reconciliation-only state after restart and repeated empty lookups', async () => {
    await seed({ status: 'sending', attempts: 1, startedAt: new Date() });
    await worker().runOnce();
    expect(await current()).toMatchObject({ status: 'reconciling', attempts: 1 });
    await due();
    await worker().runOnce();
    expect(posted).toHaveLength(0);
    orders.push({ id: 'SO-late', externalId: payload.externalId });
    await due();
    await worker().runOnce();
    expect(await current()).toMatchObject({ status: 'sent', attempts: 1, erpOrderId: 'SO-late' });
  });

  it('reconciles a write whose response body was malformed', async () => {
    await seed();
    postBody = { wrong: 'body' };
    const instance = worker();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'reconciling', attempts: 1 });
    await due();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'sent', erpOrderId: 'SO-1' });
    expect(posted).toHaveLength(1);
  });

  it.each(['retry_wait', 'reconciling'] as const)('does not post after lookup failure from %s', async (status) => {
    await seed({ status, attempts: 1 });
    lookupStatus = 503;
    await worker().runOnce();
    expect(await current()).toMatchObject({ status, attempts: 1, lastError: expect.stringContaining('503') });
    expect(posted).toHaveLength(0);
  });

  it('does not treat a malformed lookup as an empty result', async () => {
    await seed();
    lookupBody = {};
    await worker().runOnce();
    expect(await current()).toMatchObject({ status: 'retry_wait', attempts: 0 });
    expect(posted).toHaveLength(0);
  });

  it('never reposts an ambiguous 500 even when lookup remains empty', async () => {
    await seed();
    postStatus = 500;
    const instance = worker();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'reconciling', attempts: 1 });
    await due();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'reconciling', attempts: 1 });
    expect(posted).toHaveLength(1);
  });

  it('reconciles a committed ERP write after a client timeout', async () => {
    await seed();
    postHandler = () => { orders.push({ id: 'SO-timeout', externalId: payload.externalId }); };
    const instance = worker();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'reconciling', attempts: 1 });
    await due();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'sent', erpOrderId: 'SO-timeout' });
    expect(posted).toHaveLength(1);
  }, 8_000);

  it('starts delivery automatically and waits for in-flight work before application shutdown', async () => {
    await seed();
    const entered = deferred();
    const finish = deferred();
    postHandler = async (res) => {
      entered.resolve();
      await finish.promise;
      res.end(JSON.stringify({ id: 'SO-shutdown', externalId: payload.externalId }));
    };
    const instance = worker();
    instance.onApplicationBootstrap();
    await entered.promise;
    let stopped = false;
    const shutdown = instance.beforeApplicationShutdown().then(() => { stopped = true; });
    try {
      await new Promise((done) => setImmediate(done));
      expect(stopped).toBe(false);
    } finally {
      finish.resolve();
      await shutdown;
    }
    expect(await current()).toMatchObject({ status: 'sent', erpOrderId: 'SO-shutdown' });
    const [{ count }] = await database.query("SELECT COUNT(*) FROM pg_locks WHERE locktype = 'advisory' AND pid IN (SELECT pid FROM pg_stat_activity WHERE application_name = $1)", [database.options.extra.application_name]);
    expect(Number(count)).toBe(0);
    await repository.update(payload.externalId, { status: 'pending' });
    await instance.runOnce();
    expect(posted).toHaveLength(1);
  });

  it('discards the database session if advisory unlock fails', async () => {
    await seed();
    const createRunner = database.createQueryRunner.bind(database);
    const fault = jest.spyOn(database, 'createQueryRunner').mockImplementation((mode) => {
      const runner = createRunner(mode);
      const query = runner.query.bind(runner);
      runner.query = ((sql: string, ...args: any[]) => {
        if (sql.startsWith('SELECT pg_advisory_unlock(')) return Promise.reject(new Error('injected unlock failure'));
        return query(sql, ...args);
      }) as typeof runner.query;
      return runner;
    });
    try {
      await worker().runOnce();
    } finally {
      fault.mockRestore();
    }
    const [{ count }] = await database.query("SELECT COUNT(*) FROM pg_locks WHERE locktype = 'advisory' AND pid IN (SELECT pid FROM pg_stat_activity WHERE application_name = $1)", [database.options.extra.application_name]);
    expect(Number(count)).toBe(0);
    expect(await current()).toMatchObject({ status: 'sent' });
  });

  it('ignores an uncommitted submission until the originating transaction commits', async () => {
    const transaction = database.createQueryRunner();
    await transaction.startTransaction();
    try {
      await transaction.manager.getRepository(RfqSubmission).insert({ rfqId: payload.externalId, payload });
      const instance = worker();
      await instance.runOnce();
      expect(posted).toHaveLength(0);
      await transaction.commitTransaction();
      await instance.runOnce();
      expect(posted).toHaveLength(1);
      expect(await current()).toMatchObject({ status: 'sent' });
    } finally {
      if (transaction.isTransactionActive) await transaction.rollbackTransaction();
      await transaction.release();
    }
  });

  it('recovers from database failure after the ERP accepted a POST', async () => {
    await seed();
    const table = `"${schema}"."rfq_submission"`;
    await database.query(`ALTER TABLE ${table} ADD CONSTRAINT reject_sent CHECK (status <> 'sent')`);
    await expect(worker().runOnce()).resolves.toBeUndefined();
    expect(await current()).toMatchObject({ status: 'sending', attempts: 1 });
    await database.query(`ALTER TABLE ${table} DROP CONSTRAINT reject_sent`);
    await worker().runOnce();
    expect(await current()).toMatchObject({ status: 'sent', erpOrderId: 'SO-1' });
    expect(posted).toHaveLength(1);
  });

  it('does not POST if saving the sending intent fails', async () => {
    await seed();
    const table = `"${schema}"."rfq_submission"`;
    await database.query(`ALTER TABLE ${table} ADD CONSTRAINT reject_sending CHECK (status <> 'sending')`);
    await expect(worker().runOnce()).resolves.toBeUndefined();
    expect(await current()).toMatchObject({ status: 'pending', attempts: 0 });
    expect(posted).toHaveLength(0);
    await database.query(`ALTER TABLE ${table} DROP CONSTRAINT reject_sending`);
    await worker().runOnce();
    expect(await current()).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('catches polling rejection and can poll again after database recovery', async () => {
    await seed();
    const table = `"${schema}"."rfq_submission"`;
    const instance = worker();
    await database.query(`ALTER TABLE ${table} RENAME TO rfq_submission_offline`);
    await expect(instance.runOnce()).resolves.toBeUndefined();
    await database.query(`ALTER TABLE "${schema}"."rfq_submission_offline" RENAME TO rfq_submission`);
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'sent' });
  });

  it('stays in reconciliation after a socket closes without an ERP response', async () => {
    await seed();
    postHandler = (res) => { res.destroy(); };
    const instance = worker();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'reconciling', attempts: 1 });
    await due();
    await instance.runOnce();
    expect(await current()).toMatchObject({ status: 'reconciling', attempts: 1 });
    expect(posted).toHaveLength(1);
  });

  it.each([400, 401, 422])('preserves uncertain state when reconciliation lookup receives %s', async (status) => {
    await seed({ status: 'reconciling', attempts: 1 });
    lookupStatus = status;
    await worker().runOnce();
    expect(await current()).toMatchObject({ status: 'reconciling', completedAt: null });
    expect(posted).toHaveLength(0);
  });
});
