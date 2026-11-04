// ERP falso para o desafio. Sem dependências: só o runtime do Node.
//
// Simula um ERP de verdade, com os defeitos de um ERP de verdade:
// - latência variável;
// - limite de requisições simultâneas (429 com Retry-After);
// - falha transitória ANTES de gravar (503);
// - timeout DEPOIS de gravar: o pedido é criado, mas a resposta demora ~30s;
// - NÃO garante unicidade de externalId: reenviar cria outro pedido.
//
// Configuração por variável de ambiente (ver README do desafio).

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4000);
const TOKEN = process.env.ERP_API_TOKEN;
const MODE = process.env.ERP_MODE ?? 'chaos'; // chaos | calm
const MAX_CONCURRENT = Number(process.env.ERP_MAX_CONCURRENT ?? 2);
const FAIL_BEFORE_RATE = Number(process.env.ERP_FAIL_BEFORE_RATE ?? (MODE === 'calm' ? 0 : 0.15));
const TIMEOUT_AFTER_RATE = Number(process.env.ERP_TIMEOUT_AFTER_RATE ?? (MODE === 'calm' ? 0 : 0.15));
const SLOW_RESPONSE_MS = Number(process.env.ERP_SLOW_RESPONSE_MS ?? 30_000);

if (!TOKEN) {
  console.error('ERP_API_TOKEN não definido. Copie .env.example para .env.');
  process.exit(1);
}

const orders = []; // em memória: reiniciar o container zera tudo
let inFlight = 0;
let seq = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const latency = () => (MODE === 'calm' ? 50 : 100 + Math.floor(Math.random() * 700));

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('invalid json'));
      }
    });
  });
}

const PRICE = /^\d+\.\d{2}$/;

// Erros de negócio: permanentes, reenviar não adianta.
function validateOrder(o) {
  const errors = [];
  if (typeof o.externalId !== 'string' || !o.externalId) errors.push('externalId é obrigatório');
  if (typeof o.customerCode !== 'string' || !o.customerCode) errors.push('customerCode é obrigatório');
  if (o.currency !== 'USD') errors.push('currency deve ser USD');
  if (!Array.isArray(o.lines) || o.lines.length === 0) errors.push('lines não pode ser vazio');
  for (const [i, l] of (o.lines ?? []).entries()) {
    if (!Number.isInteger(l.lineNumber)) errors.push(`lines[${i}].lineNumber deve ser inteiro`);
    if (typeof l.partNumber !== 'string' || !l.partNumber) errors.push(`lines[${i}].partNumber é obrigatório`);
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) errors.push(`lines[${i}].quantity deve ser inteiro > 0`);
    if (typeof l.unit !== 'string' || !l.unit) errors.push(`lines[${i}].unit é obrigatório`);
    if (typeof l.unitPrice !== 'string' || !PRICE.test(l.unitPrice))
      errors.push(`lines[${i}].unitPrice deve ser string decimal com 2 casas, ex.: "35.51"`);
  }
  return errors;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Console de depuração: sem autenticação, só existe no ERP falso.
  if (url.pathname === '/__admin/orders' && req.method === 'GET') {
    return send(res, 200, { count: orders.length, orders });
  }
  if (url.pathname === '/__admin/reset' && req.method === 'POST') {
    orders.length = 0;
    return send(res, 204);
  }
  if (url.pathname === '/health') return send(res, 200, { ok: true, mode: MODE });

  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    return send(res, 401, { error: 'unauthorized' });
  }

  if (url.pathname === '/orders' && req.method === 'GET') {
    await sleep(latency());
    const externalId = url.searchParams.get('externalId');
    const found = externalId ? orders.filter((o) => o.externalId === externalId) : orders;
    return send(res, 200, { orders: found });
  }

  if (url.pathname === '/orders' && req.method === 'POST') {
    if (inFlight >= MAX_CONCURRENT) {
      return send(res, 429, { error: 'too many concurrent requests' }, { 'retry-after': '2' });
    }
    inFlight++;
    try {
      let body;
      try {
        body = await readJson(req);
      } catch {
        return send(res, 400, { error: 'invalid json' });
      }
      await sleep(latency());

      if (Math.random() < FAIL_BEFORE_RATE) {
        return send(res, 503, { error: 'service unavailable, try again later' });
      }

      const errors = validateOrder(body);
      if (errors.length) return send(res, 422, { error: 'validation failed', details: errors });

      const order = {
        id: `SO-${++seq}`,
        externalId: body.externalId,
        customerCode: body.customerCode,
        currency: body.currency,
        lines: body.lines,
        createdAt: new Date().toISOString(),
        requestId: randomUUID(),
      };
      orders.push(order);

      if (Math.random() < TIMEOUT_AFTER_RATE) {
        // Já gravou. O cliente provavelmente vai desistir antes da resposta chegar.
        await sleep(SLOW_RESPONSE_MS);
      }
      return send(res, 201, { id: order.id, externalId: order.externalId });
    } finally {
      inFlight--;
    }
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(
    `fake-erp ouvindo na porta ${PORT} (mode=${MODE}, maxConcurrent=${MAX_CONCURRENT}, ` +
      `failBefore=${FAIL_BEFORE_RATE}, timeoutAfter=${TIMEOUT_AFTER_RATE})`,
  );
});
