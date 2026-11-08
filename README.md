# Desafio técnico ALOIA

Desenvolvimento do desafio técnico para a ALOIA. Registrei os [passos que segui](docs/passos_desafio.pdf) e desenhei a [arquitetura e os fluxos do sistema](docs/arquitetura_aloia.png) para entender o problema e orientar a implementação.

A [SPEC.md](SPEC.md) original permanece como referência do desafio proposto pelo Leobaldo. A [spec viva](specs/001-aloia-rfq-reliability/spec.md) registra o escopo adicional e as decisões que adicionei à implementação. O [AGENT.md](AGENT.md) reúne as instruções e os critérios de validação usados para orientar o agente durante o desenvolvimento.

## O que foi implementado

- Cancelamento de itens por webhook, inclusive quando chega antes da criação do RFQ.
- Idempotência por `eventId` e primeira criação por `rfqId`, também em chamadas concorrentes.
- Envio ao ERP apenas de RFQs `READY`, com os itens `quoted` e uma única submissão por RFQ.
- Tratamento de falhas do ERP, novas tentativas seguras e consulta de pedidos com resultado incerto.
- Situação do envio no detalhe, botão **Enviar ao ERP**, carregamento, erros e atualização automática da tela.
- Filtros por cliente, RFQ e situação, ordenação e consulta manual com confirmação de atualização.
- Testes de idempotência, concorrência, regras de negócio e falhas de integração.

A aplicação mantém NestJS, TypeORM/PostgreSQL, React, Vite e TanStack Query.

## Como rodar

Requisitos: Node.js 22+, npm e Docker com Compose v2. Na raiz do projeto:

```bash
# Na primeira configuração; preserve um .env existente.
cp .env.example .env
npm ci
npm --prefix web ci
```

No `.env`, ajuste `DATABASE_URL` e as variáveis `POSTGRES_*` para o mesmo banco. Defina `INTERNAL_API_KEY`, `WEBHOOK_SECRET` e `ERP_API_TOKEN`; este último é compartilhado com o ERP simulado. Mantenha `ERP_MODE=chaos` para testar as falhas previstas no desafio.

```bash
docker compose up -d --wait
npm run start:dev
```

Em outro terminal:

```bash
npm --prefix web run dev -- --host 127.0.0.1
```

Abra [http://127.0.0.1:5173](http://127.0.0.1:5173). Por padrão, a API usa a porta `3000` e o ERP, `4000`. Se a porta do ERP estiver ocupada, defina `ERP_PORT=4001` e `ERP_BASE_URL=http://localhost:4001` no `.env` antes de iniciar o Compose.

O ambiente é local: o proxy do Vite injeta a chave da API sem expô-la no navegador, mas não substitui autenticação de usuários. O ERP simulado guarda pedidos em memória; reiniciá-lo perde esse histórico.

## Como testar

Com `DEMO_MODE=true` (padrão do `.env.example`), a API prepara seis exemplos locais ao iniciar, sem enviar pedidos ao ERP:

| RFQ | Situação inicial | Envio permitido |
| --- | --- | --- |
| `RFQ-DEMO-OPEN` | Dois itens pendentes. | Não |
| `RFQ-DEMO-PARTIAL` | Um cotado e três pendentes. | Não |
| `RFQ-DEMO-READY` | Dois cotados. | Sim, dois itens |
| `RFQ-DEMO-MIXED` | Um cotado, um cancelado e um não cotar. | Sim, só o cotado |
| `RFQ-DEMO-CLOSED` | Nenhum item cotável. | Não |
| `RFQ-DEMO-INVALID` | Dois itens inválidos. | Não |

Filtre por `RFQ-DEMO` e abra READY ou MIXED pela ação de visualizar. Clique em **Enviar ao ERP** e acompanhe o resultado; **Consultar situação** atualiza o detalhe manualmente. “Cotação enviada ao ERP” aparece somente após confirmação. Em modo `chaos`, podem ocorrer esperas e falhas.

Reiniciar preserva os exemplos e seus envios. Para outra rodada, use `DEMO_MODE=true DEMO_ROUND=2 npm run start:dev`; os IDs recebem o sufixo `-2`. A preparação fica desativada sem `DEMO_MODE=true` e é recusada em produção.

Com a API em execução, carregue os eventos de exemplo:

```bash
npm run webhooks -- basico
```

O script também aceita `duplicados`, `fora-de-ordem`, `paralelo`, `reenvio`, `assinatura-invalida` e `tudo`. Eventos válidos, inclusive repetidos, retornam `200`; assinatura inválida retorna `401`. Os cenários não limpam os dados.

Após `basico`, o `RFQ-1002` tem a linha 2 cancelada e a linha 3 em `no_quote` pela blacklist. Cote a linha 1 com `PUT /rfqs/RFQ-1002/items/1/quote`, enviando `X-Api-Key`, `Content-Type: application/json` e este corpo:

```json
{"supplier":"Acme","currency":"USD","unitCost":"12.40","moq":1,"marginPercent":"22.5"}
```

Com o RFQ em `READY`, abra o detalhe e clique em **Enviar ao ERP**. A cotação é feita pela API; a tela permite consultar o resultado e enviar. Se esse RFQ já foi submetido, use novos IDs de RFQ/evento para testar outro ciclo.

Para executar a suíte e compilar:

```bash
npm test -- --runInBand
npm run build
npm --prefix web run build
```

Os testes de integração precisam do PostgreSQL configurado em `DATABASE_URL`, com permissão para criar e remover schemas. Cada execução usa schemas próprios. Para medir cobertura, execute `npm test -- --runInBand --coverage --collectCoverageFrom='src/**/*.ts'`.

## API e autenticação

Todos os endpoints exigem `X-Api-Key`. O webhook também exige `X-Signature: sha256=<hex>`, calculada com HMAC-SHA256 sobre o corpo bruto usando `WEBHOOK_SECRET`. A exigência de chave no webhook é uma decisão adicional à SPEC original. O ERP usa `Authorization: Bearer <ERP_API_TOKEN>`.

| Método e rota | Uso |
| --- | --- |
| `POST /webhooks/rfq` | Receber criação e cancelamento de itens. |
| `GET /rfqs?page=1&pageSize=20` | Listar RFQs; máximo de 100 por página. |
| `GET /rfqs/:rfqId` | Consultar itens e situação do envio. |
| `PUT /rfqs/:rfqId/items/:lineNumber/quote` | Cotar um item. |
| `POST /rfqs/:rfqId/items/:lineNumber/no-quote` | Marcar como não cotar. |
| `POST /rfqs/:rfqId/submit` | Iniciar ou consultar a submissão existente. |
| `GET /health` | Verificar se a API responde; não verifica banco ou ERP. |

A listagem também aceita `rfq`, `customer`, `status`, `sortBy` e `sortDirection`; os filtros e a ordenação são aplicados antes da paginação.

O primeiro submit exige `READY`; fora disso, retorna `409`. Submissões em andamento retornam `202` e as concluídas, `200`. Campos e respostas estão nos [contratos da API](specs/001-aloia-rfq-reliability/contracts/api.md).

## Decisões e limites

O PostgreSQL controla a unicidade e a concorrência. Eventos ficam em `rfq_event`, com payload e timestamps; criação, cancelamento e conclusão são processados na mesma transação. Cancelamentos antecipados ficam registrados para aplicação quando o RFQ chegar.

Cada RFQ pode ter uma única `rfq_submission`, com cópia dos itens cotados, tentativas e resultado. Um worker no Nest processa os envios, sem fila externa. A submissão congela a cotação; cancelamentos posteriores permanecem no histórico local e não alteram o pedido no ERP.

O worker consulta o ERP antes do envio. `429` respeita `Retry-After`; `503` permite nova tentativa porque o contrato garante que nada foi gravado. `400`, `401` e `422` encerram o envio com erro. Timeout ou resposta incerta levam à reconciliação: consultar até encontrar o pedido, sem repetir o POST. Um GET vazio não prova que o envio anterior falhou, então a submissão pode exigir investigação manual.

Assumi que `eventId` é globalmente único e que o ERP mantém os pedidos aceitos disponíveis para consulta. Login, múltiplos fornecedores por item e alteração de pedidos já enviados seguem fora do escopo.

## Problemas encontrados

Corrigi os problemas abaixo por afetarem a consistência dos dados, os valores da cotação ou o uso do fluxo solicitado.

| Problema e impacto | Tratamento |
| --- | --- |
| Status calculado em mais de um lugar podia divergir entre lista e detalhe. | Regra de derivação compartilhada. |
| Blacklist sem normalização equivalente permitia cotar peças bloqueadas. | Mesma normalização para itens e blacklist. |
| Datas com conversão de fuso podiam mudar de dia; datas inexistentes eram aceitas. | Validação de calendário sem fuso horário. |
| Ponto flutuante causava diferenças de centavos; recotação podia manter encargos antigos. | Cálculo decimal exato, half-up no final e encargos omitidos zerados. |
| Payloads, paginação e configuração sem validação suficiente causavam erros tardios. | Validação na entrada e na inicialização, com respostas claras. |
| Lista sem navegação além da primeira página ocultava RFQs. | Paginação na interface e feedback acessível. |

Permanecem estes pontos:

| Problema | Impacto | Recomendação |
| --- | --- | --- |
| `synchronize: true` herdado. | Alterações de entidades mudam o schema automaticamente. | Adotar migrations explícitas antes de produção. |
| ERP simulado em memória e com rotas administrativas abertas. | Reinício perde pedidos; exposição de rede permite acesso aos dados. | Manter local; usar persistência e proteção no ERP real. |
| Resultado incerto sem pedido encontrado. | Reconciliação pode continuar indefinidamente. | Investigar no ERP e negociar idempotência garantida no destino. |
| Chave compartilhada e proxy sem identidade de usuário. | Quem acessa o proxy consegue usar suas rotas. | Proteger o acesso antes de publicar. |
| Health sem checagem de dependências. | API pode responder com banco ou ERP indisponível. | Adicionar readiness para implantação. |
| Eventos sem arquivamento e worker sem métricas ou alertas. | Crescimento do banco e investigação manual. | Definir retenção que preserve a deduplicação e monitorar envios. |

Com mais tempo, priorizaria essas pendências, observabilidade do worker e CI com PostgreSQL e testes de interface.

## Como usei IA

Usei Codex para analisar o repositório, discutir a solução e implementar com agentes separados por domínio, ERP, interface e revisão. Organizei regras e critérios no [AGENT.md](AGENT.md) e usei o Spec Kit para manter especificação, decisões e tarefas. Acompanhei a implementação com revisão e testes de sucesso, erro e concorrência. Os [passos do desenvolvimento](docs/passos_desafio.pdf) descrevem esse processo; o [registro da integração](outputs/aloia-main-handoff.md) reúne as verificações da versão final.
