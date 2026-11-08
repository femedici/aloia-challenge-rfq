import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ErpClient, ErpOrder } from '../src/erp/erp.client';

const order: ErpOrder = {
  externalId: 'RFQ / 42', customerCode: 'C-42', currency: 'USD',
  lines: [{ lineNumber: 1, partNumber: 'AB123', quantity: 2, unit: 'EA', unitPrice: '35.51' }],
};

describe('ERP HTTP boundary', () => {
  let server: Server;
  let client: ErpClient;
  let response: { status: number; body: unknown; headers?: Record<string, string>; stallBody?: boolean };
  let requests: { method: string; url: string; authorization: string; body: string }[];
  const originalUrl = process.env.ERP_BASE_URL;
  const originalToken = process.env.ERP_API_TOKEN;

  beforeEach(async () => {
    requests = [];
    response = { status: 201, body: { id: 'SO-1', externalId: order.externalId } };
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      requests.push({ method: req.method!, url: req.url!, authorization: req.headers.authorization!, body });
      res.writeHead(response.status, { 'content-type': 'application/json', ...response.headers });
      if (response.stallBody) { res.flushHeaders(); return; }
      res.end(JSON.stringify(response.body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.ERP_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.ERP_API_TOKEN = 'test-secret-token';
    client = new ErpClient();
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (originalUrl === undefined) delete process.env.ERP_BASE_URL;
    else process.env.ERP_BASE_URL = originalUrl;
    if (originalToken === undefined) delete process.env.ERP_API_TOKEN;
    else process.env.ERP_API_TOKEN = originalToken;
  });

  it('posts the exact order with bearer authentication', async () => {
    await expect(client.createOrder(order)).resolves.toEqual({ id: 'SO-1', externalId: order.externalId });
    expect(requests).toEqual([{ method: 'POST', url: '/orders', authorization: 'Bearer test-secret-token', body: JSON.stringify(order) }]);
  });

  it('retains typed HTTP status and a bounded, secret-free validation reason', async () => {
    response = { status: 422, body: { error: 'validation failed', details: ['lines[0].quantity must be positive', 'test-secret-token\n' + 'x'.repeat(800)] } };
    const error = await client.createOrder(order).catch((value) => value);
    expect(error.status).toBe(422);
    expect(error.message).toContain('lines[0].quantity must be positive');
    expect(error.message).not.toContain('test-secret-token');
    expect(error.message).not.toContain('\n');
    expect(error.message.length).toBeLessThanOrEqual(600);
  });

  it.each(['2', new Date(Date.now() + 60_000).toUTCString()])('parses Retry-After %s', async (value) => {
    response = { status: 429, body: { error: 'rate limited' }, headers: { 'retry-after': value } };
    const before = Date.now();
    const error = await client.createOrder(order).catch((value) => value);
    expect(error.status).toBe(429);
    const expected = value === '2' ? 2_000 : Math.max(0, Date.parse(value) - before);
    expect(error.retryAfterMs).toBeGreaterThanOrEqual(expected - 500);
    expect(error.retryAfterMs).toBeLessThanOrEqual(expected);
  });

  it.each([{ id: 'SO-1', externalId: 'wrong-rfq' }, { externalId: order.externalId }, null])('rejects ambiguous success body %j', async (body) => {
    response.body = body;
    await expect(client.createOrder(order)).rejects.toThrow('invalid order response');
  });

  it('looks up the escaped RFQ identifier and validates the order list', async () => {
    response = { status: 200, body: { orders: [{ id: 'SO-1', externalId: order.externalId }] } };
    await expect(client.findOrders(order.externalId)).resolves.toEqual([{ id: 'SO-1', externalId: order.externalId }]);
    expect(new URL(requests[0].url, 'http://localhost').searchParams.get('externalId')).toBe(order.externalId);
    expect(requests[0].method).toBe('GET');
  });

  it.each([{}, { orders: null }, { orders: [{ id: 'SO-1', externalId: 'wrong' }] }])('rejects malformed lookup %j', async (body) => {
    response = { status: 200, body };
    await expect(client.findOrders(order.externalId)).rejects.toThrow('invalid order response');
  });

  it('bounds the whole response, including a stalled body after response headers', async () => {
    response.stallBody = true;
    let deadline: NodeJS.Timeout;
    const result = await Promise.race([
      client.createOrder(order).catch((error: Error) => error.name),
      new Promise((resolve) => { deadline = setTimeout(() => resolve('still waiting'), 5_500); }),
    ]);
    clearTimeout(deadline!);
    expect(result).toBe('AbortError');
  }, 7_000);
});
