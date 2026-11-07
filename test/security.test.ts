import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { ApiKeyGuard } from '../src/common/api-key.guard';
import { HealthController } from '../src/health/health.controller';
import { ItemsController } from '../src/rfq/items.controller';
import { RfqController } from '../src/rfq/rfq.controller';
import { WebhookController } from '../src/rfq/webhook.controller';
import { RfqService } from '../src/rfq/rfq.service';

const key = 'test-internal-key';
const secret = 'test-webhook-secret';

describe('API authentication', () => {
  let app: INestApplication;
  const processEvent = jest.fn(async () => undefined);
  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = key;
    process.env.WEBHOOK_SECRET = secret;
    const module = await Test.createTestingModule({
      controllers: [HealthController, ItemsController, RfqController, WebhookController],
      providers: [{ provide: RfqService, useValue: {
        processEvent, list: async () => [], getRfq: async () => ({}),
        quoteItem: async () => ({}), noQuote: async () => ({}),
      } }],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.useLogger(false);
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => { await app?.close(); });

  test.each([
    ['get', '/health'], ['get', '/rfqs'], ['get', '/rfqs/TEST'],
    ['put', '/rfqs/TEST/items/1/quote'], ['post', '/rfqs/TEST/items/1/no-quote'],
    ['post', '/webhooks/rfq'],
  ])('%s %s rejects absent and wrong keys', async (method, path) => {
    for (const candidate of [undefined, 'wrong-key', 'x'.repeat(key.length)]) {
      const call = request(app.getHttpServer())[method](path);
      if (candidate) call.set('x-api-key', candidate);
      const body = JSON.stringify({ eventId: 'security', type: 'rfq.created', occurredAt: '2026-11-02T00:00:00Z', data: {
        rfqId: 'TEST', customer: { code: 'C', name: 'Customer' }, items: [],
      } });
      call.set('x-signature', `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
      call.set('content-type', 'application/json');
      await call.send(body).expect(401);
    }
  });

  it('rejects well-formed forged signatures and bodies modified after signing', async () => {
    const body = JSON.stringify({ type: 'rfq.created' });
    for (const [signed, signingSecret] of [[body, 'wrong-secret'], [body + ' ', secret]]) {
      await request(app.getHttpServer()).post('/webhooks/rfq').set('x-api-key', key)
        .set('content-type', 'application/json')
        .set('x-signature', `sha256=${createHmac('sha256', signingSecret).update(signed).digest('hex')}`)
        .send(body).expect(401);
    }
    expect(processEvent).not.toHaveBeenCalled();
  });

  it('accepts a configured key and still requires a valid webhook signature', async () => {
    await request(app.getHttpServer()).get('/health').set('x-api-key', key).expect(200);
    await request(app.getHttpServer()).post('/webhooks/rfq').set('x-api-key', key)
      .set('x-signature', 'sha256=invalid').send({}).expect(401);
    await request(app.getHttpServer()).post('/webhooks/rfq').set('x-api-key', key).send({}).expect(401);
  });

  it('fails closed when configuration and header are both absent', () => {
    const old = process.env.INTERNAL_API_KEY;
    delete process.env.INTERNAL_API_KEY;
    try {
      const context = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as ExecutionContext;
      expect(() => new ApiKeyGuard().canActivate(context)).toThrow();
    } finally { process.env.INTERNAL_API_KEY = old; }
  });
});
