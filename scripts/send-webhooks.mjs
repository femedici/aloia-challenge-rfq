#!/usr/bin/env node
// Simula o sistema do cliente enviando webhooks de RFQ, com os defeitos de entrega
// que acontecem na vida real.
//
// Uso:
//   node scripts/send-webhooks.mjs [cenario] [--url http://localhost:3000/webhooks/rfq]
//
// Cenários:
//   basico               cada evento uma vez, na ordem
//   duplicados           cada evento 3 vezes seguidas
//   fora-de-ordem        cancelamentos chegam antes da criação do RFQ
//   paralelo             o mesmo evento 10 vezes ao mesmo tempo
//   reenvio              o cliente reenvia o RFQ-1002 com outro eventId
//   assinatura-invalida  um evento com assinatura errada (deve ser recusado)
//   tudo                 todos acima, em sequência
//
// Lê WEBHOOK_SECRET do ambiente ou do arquivo .env na raiz do projeto.

import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const file = join(root, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnv();

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const URL_ = urlIdx >= 0 ? args[urlIdx + 1] : 'http://localhost:3000/webhooks/rfq';
const scenario = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--url') ?? 'basico';
const SECRET = process.env.WEBHOOK_SECRET;
if (!SECRET) {
  console.error('WEBHOOK_SECRET não definido (ambiente ou .env).');
  process.exit(1);
}

const dir = join(root, 'fixtures', 'events');
const events = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => [f.replace(/\.json$/, ''), readFileSync(join(dir, f), 'utf8')]),
);
const ev = (prefix) => {
  const key = Object.keys(events).find((k) => k.startsWith(prefix));
  return { name: key, body: events[key] };
};

const sign = (body, secret = SECRET) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

async function post({ name, body }, { badSignature = false } = {}) {
  const started = Date.now();
  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature': sign(body, badSignature ? 'segredo-errado' : SECRET),
      },
      body,
    });
    console.log(`  ${res.status}  ${name}  (${Date.now() - started}ms)`);
  } catch (err) {
    console.log(`  ERRO ${name}: ${err.message}`);
  }
}

const scenarios = {
  async basico() {
    for (const p of ['01', '02', '03', '04']) await post(ev(p));
  },
  async duplicados() {
    for (const p of ['01', '02', '03', '04']) for (let i = 0; i < 3; i++) await post(ev(p));
  },
  async 'fora-de-ordem'() {
    for (const p of ['02', '04', '01', '03']) await post(ev(p));
  },
  async paralelo() {
    await Promise.all(Array.from({ length: 10 }, () => post(ev('01'))));
    await Promise.all(Array.from({ length: 10 }, () => post(ev('02'))));
  },
  async reenvio() {
    await post(ev('03'));
    await post(ev('05'));
  },
  async 'assinatura-invalida'() {
    await post(ev('01'), { badSignature: true });
  },
};

async function run(name) {
  console.log(`\n# ${name}`);
  await scenarios[name]();
}

if (scenario === 'tudo') {
  for (const name of Object.keys(scenarios)) await run(name);
} else if (scenarios[scenario]) {
  await run(scenario);
} else {
  console.error(`Cenário desconhecido: ${scenario}. Opções: ${[...Object.keys(scenarios), 'tudo'].join(', ')}`);
  process.exit(1);
}
