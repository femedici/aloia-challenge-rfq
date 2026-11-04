# SPEC: Cancelamento de item e envio de RFQ ao ERP

## Contexto

Somos uma distribuidora de peças aeronáuticas. Os clientes mandam pedidos de cotação (**RFQ**, *request for quotation*) pelo sistema deles, que nos avisa por **webhook**. Cada RFQ tem vários itens: part number, quantidade, unidade e data de necessidade.

Este repositório é o **serviço de RFQ que já existe**. Ele foi construído por outra equipe e está em produção. Hoje ele:

- recebe o webhook `rfq.created`, normaliza e valida os itens;
- deixa o comprador cotar cada item (`PUT .../quote`) ou marcar como "não cotar";
- mostra os RFQs numa tela React.

## O problema

Duas coisas faltam para o fluxo fechar:

1. **O cliente cancela itens**, e hoje ignoramos esse evento. O comprador perde tempo cotando o que o cliente já não quer.
2. **A cotação pronta não chega ao ERP.** Hoje alguém redigita tudo no ERP à mão.

O sistema do cliente é pouco confiável. Ele reenvia o mesmo evento, entrega fora de ordem e às vezes dispara a mesma coisa várias vezes ao mesmo tempo. O ERP também é lento, tem limite de requisições, falha de vez em quando e às vezes **grava o pedido e demora a responder**.

## Decisões fechadas

1. O `rfqId` identifica o RFQ. O primeiro `rfq.created` de um `rfqId` vale. Um `rfq.created` posterior para o mesmo `rfqId`, mesmo com outro `eventId`, é ignorado.
2. Um evento com `eventId` já processado é ignorado. O endpoint responde 2xx do mesmo jeito.
3. O estado final de um RFQ **não depende da ordem de entrega** dos eventos.
4. O ERP **não garante unicidade** de `externalId`. Garantir que não haja pedido duplicado é responsabilidade nossa.
5. Os endpoints internos (todos menos o webhook) exigem o header `X-Api-Key`.

## Tarefas

### 1. Webhook: cancelamento de item e idempotência

Suporte o evento `rfq.item_canceled`:

```json
{
  "eventId": "evt_01JC3A1002",
  "type": "rfq.item_canceled",
  "occurredAt": "2026-11-02T15:40:03Z",
  "data": { "rfqId": "RFQ-1001", "lineNumber": 3, "reason": "Cliente comprou de outro fornecedor" }
}
```

O item cancelado vai para `canceled`. Os **dois** eventos (`rfq.created` e `rfq.item_canceled`) precisam respeitar as decisões 1 a 3. Isso vale também quando o mesmo evento chega várias vezes ao mesmo tempo.

### 2. Envio ao ERP

`POST /rfqs/:rfqId/submit`

- Só é permitido com o RFQ em `READY`. Fora disso, responde `409`.
- Envia **um** pedido ao ERP com **apenas os itens `quoted`**.
- Pode ser síncrono ou assíncrono, à sua escolha. Em qualquer caso, o `GET /rfqs/:rfqId` precisa mostrar a situação do envio, distinguindo:
  - ainda não enviado;
  - em andamento ou aguardando nova tentativa;
  - enviado, com o `id` do pedido no ERP;
  - falhou de forma definitiva, com o motivo.
- **Nada pode gerar dois pedidos no ERP para o mesmo RFQ.**

### 3. Tela

Na tela de detalhe do RFQ:
- mostre a situação do envio ao ERP;
- adicione um botão **"Enviar ao ERP"**, habilitado só quando o RFQ estiver `READY`, com estado de carregamento e de erro.

A tela deve se manter atualizada enquanto o envio está em andamento.

### 4. Testes

Cubra pelo menos:
- a idempotência do webhook;
- o envio ao ERP sem duplicar pedido.

### 5. O que você encontrou

O código existente tem problemas além do escopo destas tarefas. **Não é preciso corrigir tudo.** Corrija o que julgar mais importante e registre o resto.

No seu README, liste os outros problemas que encontrou: o que é, qual o impacto e o que você recomendaria. Se corrigiu algum além do necessário, explique por quê.

## API do ERP

Autenticação: header `Authorization: Bearer <ERP_API_TOKEN>`. Já existe um cliente HTTP em `src/erp/erp.client.ts`.

`POST /orders`

```json
{
  "externalId": "<seu identificador>",
  "customerCode": "C-0042",
  "currency": "USD",
  "lines": [
    { "lineNumber": 1, "partNumber": "AB223104", "quantity": 3, "unit": "EA", "unitPrice": "35.51" }
  ]
}
```

| resposta | significado |
|---|---|
| `201 { id, externalId }` | criado |
| `422` | erro de validação. É permanente: reenviar não adianta |
| `429` + `Retry-After` | limite de requisições simultâneas (2). É transitório |
| `503` | indisponível, nada foi gravado. É transitório |
| sem resposta por ~30s | **pode ter gravado**. O ERP às vezes grava e demora a responder |

`GET /orders?externalId=<id>` lista os pedidos com aquele `externalId`.

## Fora de escopo

- Login de usuários.
- Cancelar ou alterar o pedido no ERP depois de enviado.
- Mais de um fornecedor por item.

---

## Regras do domínio (referência)

É assim que o sistema **deveria** funcionar.

### Normalização dos itens

**Dado original:** sempre guardado como veio. A normalização é guardada ao lado.

**Part number:**
- Remove espaços nas pontas, converte para maiúsculas e remove espaços internos, `-`, `.` e `/`.
  - Exemplo: `" ab-2231/04 "` vira `AB223104`.
- Depois de normalizado, precisa ter 3 ou mais caracteres e só `A-Z` e `0-9`. Senão o item fica `invalid`.

**Unidade:** convertida pela tabela em `data/units.json`. Fora da tabela, o item fica `invalid`.

**Quantidade:** precisa ser inteiro maior que 0. Senão o item fica `invalid`.

**Data de necessidade:** aceita `YYYY-MM-DD` e `MM/DD/YYYY`.
- É uma data de calendário, sem hora nem fuso, e é devolvida como `YYYY-MM-DD`.
- Formato não aceito ou data que não existe: fica `null`, com o aviso `invalid_required_by`.

**Blacklist:** o item nasce `no_quote` quando o part number normalizado bate com algum da `data/blacklist.json`, também normalizado.

**Possível duplicata:** dois itens válidos com o mesmo part number, quantidade e unidade. O de `lineNumber` maior recebe o aviso `possible_duplicate`.

### Status do item

| status | quando |
|---|---|
| `invalid` | falhou na validação. É final |
| `no_quote` | está na blacklist ou o comprador marcou como "não cotar" |
| `pending` | válido e ainda não cotado |
| `quoted` | tem cotação de fornecedor |
| `canceled` | o cliente cancelou. É final |

### Status do RFQ

É derivado dos itens. Itens `invalid` não entram na conta.

| status | regra |
|---|---|
| `INVALID` | nenhum item válido |
| `OPEN` | todos os itens válidos estão `pending` |
| `IN_PROGRESS` | pelo menos um `pending` e pelo menos um que não é `pending` |
| `READY` | nenhum `pending` e pelo menos um `quoted` |
| `CLOSED` | nenhum `pending` e nenhum `quoted` |

### Preço

```
qtdComprada   = max(quantity, moq)
custoTotal    = unitCost × qtdComprada + freight + otherCharges + customs
custoUnitario = custoTotal ÷ quantity
precoUnitario = custoUnitario × (1 + marginPercent ÷ 100) × taxaUSD[currency]   (data/fx-rates.json)
unitPriceUsd  = precoUnitario arredondado para 2 casas, metade para cima (half-up), só no final
totalPriceUsd = unitPriceUsd × quantity
```

**Exemplo**, com quantidade 3, EUR, `unitCost` 10.10, `moq` 5, frete 25.00, alfândega 7.35 e margem 18.5%: o resultado é `unitPriceUsd` = `35.51` e `totalPriceUsd` = `106.53`.
