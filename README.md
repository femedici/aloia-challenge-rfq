# Desafio técnico: serviço de RFQ

Obrigado por participar! Neste desafio você vai **evoluir um sistema que já existe**, como vai acontecer no dia a dia. As tarefas estão em **[SPEC.md](SPEC.md)**.

## Combinado

- **Dúvidas:** por e-mail para leobaldo.alcantara@aloiaaerospace.com.
- **IA:** liberada e incentivada. Use as ferramentas e técnicas que preferir. Só pedimos transparência sobre como usou.
- **Depois da entrega:** uma conversa de 30 minutos em que você explica suas decisões.

## O que já existe

| | |
|---|---|
| `src/` | API NestJS + TypeORM (Postgres) |
| `web/` | tela React + Vite + TanStack Query |
| `fake-erp/` | ERP simulado, com falhas de propósito. Não precisa mexer |
| `fixtures/events/` | webhooks de exemplo |
| `scripts/send-webhooks.mjs` | envia os webhooks simulando problemas reais de entrega |
| `data/` | tabela de unidades, blacklist e câmbio |

## Como rodar

Pré-requisitos: Node 22+ e Docker.

```bash
cp .env.example .env
docker compose up -d       # Postgres e ERP simulado (:4000)
npm install
npm run start:dev          # API em :3000
npm test

cd web
npm install
npm run dev                # tela em http://localhost:5173
```

O ERP simulado roda com falhas por padrão (`ERP_MODE=chaos`). Para desenvolver sem elas, use `ERP_MODE=calm` no `.env` e rode `docker compose up -d` de novo. **O envio ao ERP precisa funcionar no modo `chaos`.**

### Simulando os webhooks

```bash
npm run webhooks -- basico               # cada evento uma vez, na ordem
npm run webhooks -- duplicados           # cada evento 3 vezes
npm run webhooks -- fora-de-ordem        # cancelamentos antes da criação
npm run webhooks -- paralelo             # o mesmo evento 10x ao mesmo tempo
npm run webhooks -- reenvio              # mesmo RFQ, outro eventId
npm run webhooks -- assinatura-invalida  # deve ser recusado
npm run webhooks -- tudo
```

Para cotar um item:

```bash
curl -X PUT localhost:3000/rfqs/RFQ-1002/items/1/quote \
  -H "X-Api-Key: <INTERNAL_API_KEY do .env>" -H "content-type: application/json" \
  -d '{"supplier":"Acme","currency":"USD","unitCost":"12.40","moq":1,"freight":"15.00","marginPercent":"22.5"}'
```

Para ver o que chegou ao ERP: `curl localhost:4000/__admin/orders`. Para zerar: `curl -X POST localhost:4000/__admin/reset`.

## Entrega

Repositório **privado** no GitHub, com acesso de leitura para o usuário **leobaldoneto**. Mantenha o histórico de commits.

**O projeto precisa rodar seguindo o seu README.**

O seu README deve trazer:

1. **Como rodar.**
2. **Decisões e trade-offs**: o que você escolheu e por quê.
3. **Suposições** sobre o que a spec não cobria.
4. **Problemas que encontrei no código existente** (seção 5 da SPEC).
5. **O que faria com mais tempo.**
6. **Como usei IA**: ferramentas, como organizou o contexto e onde precisou corrigir o que a IA gerou.

Versione também o arquivo de contexto que você deu ao agente (`AGENTS.md`, `CLAUDE.md` ou equivalente). Se usou outras técnicas, como specs, planos, prompts ou subagentes, fique à vontade para incluir.

## O que avaliamos

- Aderência à spec
- Corretude, principalmente na idempotência e na integração com o ERP
- Leitura do código existente: o que você percebeu, corrigiu e registrou
- Testes
- Segurança
- Clareza e organização do código
- Uso de IA
- Comunicação (README, commits e a conversa final)
