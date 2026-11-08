# Aloia — RFQs e envio confiável ao ERP

Evolução do desafio técnico da Aloia Aerospace: recebimento de RFQs por webhook, cancelamento de itens, cotação e envio ao ERP sem duplicar pedidos nas situações previstas pelo contrato. A aplicação mantém NestJS, TypeORM/PostgreSQL, React, Vite e TanStack Query.

A [SPEC.md](SPEC.md) original permanece como referência do desafio. A [spec viva](specs/001-aloia-rfq-reliability/spec.md) registra o escopo adicional e as decisões aprovadas. O [tasks.md](specs/001-aloia-rfq-reliability/tasks.md) é o único tracker; o [handoff](outputs/aloia-rfq-handoff.md) reúne os resultados efetivamente verificados, cobertura, inventário e estado da entrega. O contexto para agentes está em [AGENT.md](AGENT.md).

A revisão **CONTROLE RFQ** usa a logo fornecida, filtros globais de cliente/RFQ/situação, ordenação por coluna, tabela com rolagem interna e ação de visualização. A coluna Cotação mostra “Cotação enviada ao ERP” somente após confirmação; a coluna ERP foi removida; a consulta manual mostra carregamento, confirmação com horário e erro. O [desenho TXT da arquitetura](outputs/aloia-rfq-arquitetura.txt) explica todas as entidades e o fluxo real. O [handoff da revisão](outputs/aloia-rfq-ui-review-handoff.md) registra a validação atual e a branch sem commits contra o original, disponível localmente em `http://127.0.0.1:5174`.

O histórico original foi preservado na cópia privada de `femedici/aloia-challenge-rfq`, com o repositório da Aloia mantido como `upstream`. O desafio solicita acesso de leitura para `leobaldoneto`; esse acesso **não foi concedido**. Repositórios privados de conta pessoal oferecem acesso de colaborador com escrita, não um papel somente leitura. Atender à exigência depende de uma organização com esse papel ou de uma decisão explícita sobre outra permissão; nenhuma mudança de visibilidade ou convite está implícita nesta entrega. Veja a [documentação de permissões do GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository).

## 1. Como rodar

### Preparar um ambiente local

Use Node.js 22 ou superior, npm e Docker com Compose v2. Execute os comandos a partir da raiz do repositório.

```bash
# Somente na primeira configuração; preserve um .env já existente.
cp .env.example .env
npm ci
npm --prefix web ci
```

Edite o `.env` local antes de iniciar:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL da API e dos testes de integração. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Configuração do PostgreSQL no Compose; mantenha a URL compatível. |
| `INTERNAL_API_KEY` | Chave exigida nos endpoints da aplicação, inclusive webhook e health. |
| `WEBHOOK_SECRET` | Segredo do HMAC do webhook; também usado pelo simulador de eventos. |
| `ERP_API_TOKEN` | Mesmo token para o ERP simulado e para o cliente da API. |
| `ERP_BASE_URL` | Endereço acessado pela API; padrão local `http://localhost:4000`. |
| `ERP_MODE` | `chaos` é o padrão; `calm` facilita uma primeira exploração. |
| `PORT` | Porta da API; padrão `3000`. |
| `DEMO_MODE` | `true` no `.env.example`: prepara os seis exemplos locais ao iniciar. Ausente/`false` desativa; `true` é recusado em produção. |
| `DEMO_ROUND` | Sufixo opcional de até 32 letras, números ou hífens para criar outra rodada sem apagar dados. |

Substitua os valores de exemplo das chaves e segredos por valores locais. O `.env` é ignorado pelo Git. Não coloque chaves em variáveis `VITE_*`, no código do navegador, em argumentos de comandos ou em arquivos versionados. A API valida a presença das configurações obrigatórias, os protocolos das URLs e a porta antes de aceitar requisições.

```bash
docker compose up -d --wait
npm run start:dev
```

Em outro terminal, na raiz:

```bash
npm --prefix web run dev -- --host 127.0.0.1
```

Abra a interface em [http://127.0.0.1:5173](http://127.0.0.1:5173). A API fica em `http://localhost:3000` e o ERP em `http://localhost:4000`, salvo alteração no `.env`.

Se a porta `4000` já estiver ocupada, configure **as duas** variáveis abaixo no `.env` e inicie o serviço usando essa configuração:

```dotenv
ERP_PORT=4001
ERP_BASE_URL=http://localhost:4001
```

Essa é uma alternativa para colisão de porta; `4000` continua sendo o padrão. Não é necessário reiniciar ou recriar um ERP já disponível com a configuração correta. O ERP simulado guarda pedidos em memória: reiniciá-lo perde esse histórico. O fluxo deve funcionar em `chaos`; `calm` não substitui sua validação.

O comando do Vite acima restringe a interface ao loopback. A API usa o binding padrão do Nest e as portas do Compose usam o binding padrão do Docker, que podem aceitar conexões de outras interfaces. Mantenha este ambiente restrito à máquina/rede de desenvolvimento. O proxy do Vite injeta `X-Api-Key` no servidor e evita incluí-la no bundle, mas qualquer pessoa que alcançar esse proxy poderá usar suas rotas. Publicação exige um proxy protegido e autenticação adequados; essa infraestrutura não está implementada neste desafio.

### Exemplos prontos ao iniciar — roteiro do revisor

Com `DEMO_MODE=true` (já configurado no `.env.example`), `npm run start:dev` prepara automaticamente os exemplos abaixo antes de disponibilizar a API. Em um `.env` antigo, adicione essa variável. Abra a tela e filtre RFQ por **RFQ-DEMO** ou cliente por **Demonstração**.

| RFQ | Itens iniciais | Status da cotação | Botão Enviar ao ERP |
| --- | --- | --- | --- |
| `RFQ-DEMO-OPEN` | 2 pendentes | `OPEN` | Desabilitado |
| `RFQ-DEMO-PARTIAL` | 1 cotado + 3 pendentes | `IN_PROGRESS` | Desabilitado |
| `RFQ-DEMO-READY` | 2 cotados | `READY` | **Habilitado**; envia 2 itens |
| `RFQ-DEMO-MIXED` | 1 cotado + 1 cancelado + 1 não cotar | `READY` | **Habilitado**; envia só o item 1 |
| `RFQ-DEMO-CLOSED` | 1 não cotar + 1 cancelado | `CLOSED` | Desabilitado |
| `RFQ-DEMO-INVALID` | 2 part numbers inválidos | `INVALID` | Desabilitado |

1. Abra **READY** pelo olho: confirme os preços e clique **Enviar ao ERP**. Os preços são dados sintéticos, calculados pela regra real: USD 10 de custo, margem de 20%, quantidade 2 por item; total de USD 24 por linha.
2. Acompanhe a situação no detalhe. Em `chaos`, pode haver espera, nova tentativa, reconciliação ou falha definitiva; somente a confirmação do ERP mostra **Cotação enviada ao ERP** e seu ID. Não se espera sucesso imediato em todos os casos.
3. Abra **MIXED** e envie: somente a linha cotada integra o pedido; cancelada e não cotada continuam visíveis no detalhe local.
4. Confira que **PARTIAL**, mesmo tendo um item cotado, não permite envio. A API também recusa com `409`; não basta desabilitar o botão.
5. Use **Consultar situação** para verificar a confirmação visual de atualização. Compare os pedidos no `GET /__admin/orders` do ERP simulado.

A preparação não envia pedidos automaticamente, não cria submissões e não simula confirmação do ERP. Reutiliza os serviços reais de eventos, cotação e cancelamento. É uma preparação local de dados; a assinatura HTTP do webhook é exercitada separadamente pelos comandos abaixo. Não há formulário de precificação na tela: os exemplos já chegam precificados para permitir o teste manual do envio.

**Reiniciar preserva o estado atual**, inclusive RFQs editadas, enviadas ou com falha. Os estados da tabela acima descrevem a primeira preparação. Cada cenário é transacional: falha parcial é revertida; outra inicialização completa os cenários ausentes. Inicializações simultâneas não duplicam exemplos. Os IDs são exclusivos `RFQ-DEMO-*`, separados de `RFQ-1001` e `RFQ-1002` dos webhooks.

Para testar novamente após enviar, pare apenas a API, escolha uma rodada ainda não utilizada e reinicie:

```bash
DEMO_MODE=true DEMO_ROUND=2 npm run start:dev
```

Isso cria, por exemplo, `RFQ-DEMO-READY-2` e `RFQ-DEMO-MIXED-2`, sem alterar a rodada anterior. Você também pode definir `DEMO_ROUND=2` no `.env`. Repetir a mesma rodada preserva seus dados; use `3`, `4` etc. para outras rodadas. Não reinicie nem resete o ERP para repetir testes: ele mantém os pedidos em memória.

**Valide pelos dois caminhos:** a interface com os exemplos de inicialização testa a experiência de envio; os webhooks abaixo testam recebimento, repetição, concorrência e assinatura. Para asserções automáticas com banco isolado:

```bash
npm test -- --runInBand test/rfq-demo.test.ts test/rfq-events.test.ts test/security.test.ts
# Toda a suíte, incluindo falhas e reconciliação do ERP:
npm test -- --runInBand
```

A suíte desativa a carga demonstrativa por padrão, independentemente do `.env`. Os testes de demonstração a ativam explicitamente em schema temporário próprio. Não apagam os dados do revisor.

### Carregar os eventos e testar o fluxo

Com a API disponível:

```bash
npm run webhooks -- basico
npm run webhooks -- duplicados
npm run webhooks -- fora-de-ordem
npm run webhooks -- paralelo
npm run webhooks -- reenvio
npm run webhooks -- assinatura-invalida
# Executa os cenários anteriores em sequência:
npm run webhooks -- tudo
```

O script lê `INTERNAL_API_KEY` e `WEBHOOK_SECRET` do ambiente ou do `.env`, envia a chave e assina os bytes do corpo. Eventos válidos, inclusive repetidos, devem retornar `200`; o cenário de assinatura inválida deve retornar `401`. O script exibe as respostas para inspeção; as asserções automatizadas estão nos testes. Nenhum desses cenários limpa o banco ou os pedidos do ERP. Se os eventos já existirem, esses comandos verificam reentrega; a prova de cancelamento antes da primeira criação e concorrência sobre dados novos está na suíte isolada. Para outra porta, acrescente `--url http://127.0.0.1:3001/webhooks/rfq` ao comando.

Após `basico`, o `RFQ-1002` tem a linha 2 cancelada e a linha 3 em `no_quote` pela blacklist. Cote a linha 1 para deixá-lo `READY`. Este exemplo lê a chave no processo, sem expô-la nos argumentos:

```bash
node --input-type=module <<'NODE'
import 'dotenv/config';

const base = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const headers = {
  'content-type': 'application/json',
  'x-api-key': process.env.INTERNAL_API_KEY,
};
const quote = await fetch(`${base}/rfqs/RFQ-1002/items/1/quote`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    supplier: 'Acme', currency: 'USD', unitCost: '12.40', moq: 1,
    freight: '15.00', marginPercent: '22.5',
  }),
});
if (!quote.ok) {
  console.error(quote.status, await quote.json());
  process.exitCode = 1;
} else {
  const detail = await fetch(`${base}/rfqs/RFQ-1002`, { headers });
  const rfq = await detail.json();
  console.log({ rfqId: rfq.rfqId, status: rfq.status, submission: rfq.submission });
}
NODE
```

Abra o detalhe do `RFQ-1002` na interface e use **Enviar ao ERP**. A tela mostra carregamento, resultado ou motivo da falha e consulta o detalhe automaticamente enquanto o envio estiver ativo. A listagem permite navegar além da primeira página; estados, erros e ações têm identificação textual e foco de teclado, com apresentação adaptada a telas estreitas. A direção visual segue as cores azul-marinho e laranja da Aloia.

Se esse RFQ já foi submetido, uma nova cotação retorna `409`: a submissão congelou a cotação. Reenviar os mesmos fixtures não inicia outro ciclo. Para explorar um novo ciclo, utilize novos identificadores de RFQ e evento em dados de teste, preservando o histórico existente.

Para inspecionar o simulador local, `GET /__admin/orders` no endereço de `ERP_BASE_URL` lista os pedidos. Essa é uma rota de depuração do **ERP simulado**, fora da API desta aplicação. Não use reset nem reinicie o ERP para obter testes verdes: isso apaga a evidência necessária à reconciliação.

### Endpoints e autenticação

Todos os endpoints da aplicação exigem `X-Api-Key`. O webhook exige também `X-Signature: sha256=<hex>` com HMAC-SHA256 sobre o corpo bruto, usando `WEBHOOK_SECRET`. Isso amplia a proteção do webhook em relação à SPEC original, conforme a spec viva aprovada. A comunicação com o ERP mantém seu protocolo próprio, `Authorization: Bearer <ERP_API_TOKEN>`.

| Método e rota | Comportamento |
| --- | --- |
| `GET /health` | Responde `{ "ok": true }`; indica que a API atende, sem verificar disponibilidade do banco/ERP. |
| `POST /webhooks/rfq` | Recebe `rfq.created` ou `rfq.item_canceled`; repetições válidas retornam `200` sem reaplicar o evento. |
| `GET /rfqs?page=1&pageSize=20` | Lista resumida com `submissionStatus`; `pageSize` até `100`; filtros `rfq`, `customer`, `status` e ordenação `sortBy`/`sortDirection` antes da paginação. |
| `GET /rfqs/:rfqId` | Detalhe com todos os itens e o estado persistido de `submission`. |
| `PUT /rfqs/:rfqId/items/:lineNumber/quote` | Cota item elegível; campos monetários são strings decimais. |
| `POST /rfqs/:rfqId/items/:lineNumber/no-quote` | Marca item elegível como `no_quote`. |
| `POST /rfqs/:rfqId/submit` | Aceita um novo envio somente em `READY`; retorna a submissão existente nas repetições. |

O submit retorna `202` enquanto a submissão estiver ativa e `200` se ela já for terminal. Falha de autenticação retorna `401`; payload ou parâmetros inválidos, `400`; recurso inexistente, `404`; transição proibida ou novo envio fora de `READY`, `409`. Consulte os [contratos](specs/001-aloia-rfq-reliability/contracts/api.md) para os campos da resposta.

### Testes e builds

Os testes de integração usam PostgreSQL real a partir de `DATABASE_URL`. O usuário do banco precisa criar e remover schemas. Cada execução cria schemas com nomes únicos e remove somente aqueles que criou; não executa reset do schema da aplicação nem do fake ERP. Os testes de falhas do ERP usam servidores HTTP locais controlados, sem alterar `fake-erp/`.

```bash
npm test -- --runInBand
npm test -- --runInBand --coverage --collectCoverageFrom='src/**/*.ts'
npm run build
npm --prefix web run build
```

Há cenários de sucesso, rejeição, concorrência, eventos fora de ordem, timeout após gravação, reinício e falha de persistência. A suíte de ERP verifica locks e estados no PostgreSQL; a concorrência não é simulada por um lock em memória. O relatório de cobertura é gerado em `coverage/`. Quantidades de testes, recorte de cobertura, verificações visuais e resultados da execução local estão no [handoff](outputs/aloia-rfq-handoff.md), para não manter números divergentes em dois documentos.

## 2. Decisões e trade-offs

### Persistência e concorrência

O banco arbitra a identidade dos eventos, RFQs, linhas e submissões por constraints únicas. O processamento do evento, as alterações do RFQ e a marcação de conclusão ocorrem na mesma transação. Locks transacionais por `rfqId` serializam criação, cancelamento, edição e captura da cotação; não dependem de uma única instância da API.

O ledger `rfq_event` retém o payload e os timestamps do evento. Cancelamentos anteriores à criação são reaplicados quando o RFQ aparece, inclusive sem criar um RFQ incompleto. Isso evita outra tabela de cancelamentos pendentes. O primeiro `rfq.created` serializado vence, mesmo que uma entrega posterior tenha outro `eventId`. A retenção permanente dos IDs protege a deduplicação, com custo de crescimento do armazenamento.

### Uma submissão por RFQ

`rfq_submission` guarda o payload congelado, tentativas, timestamps, resultado e motivo de erro. A criação dessa linha ocorre dentro da transação do RFQ. Apenas itens `quoted` entram no payload; todos os itens continuam no detalhe local. Depois do submit, alterações de cotação e de `no_quote` são bloqueadas. Cancelamentos posteriores continuam registrados localmente, mas não alteram nem cancelam o pedido no ERP.

Um worker do próprio Nest consulta submissões pendentes/vencidas e agenda um novo ciclo um segundo após terminar o anterior. Cada entrega usa uma conexão dedicada com advisory lock de sessão, permitindo que outras instâncias e o navegador vejam o progresso já commitado sem manter uma transação longa durante a rede. O worker registra `sending` **antes** do POST e usa sempre `externalId = rfqId`. Não foi adicionado broker, fila externa ou biblioteca de retries.

| Estado | Significado |
| --- | --- |
| `not_sent` | Ainda não existe uma submissão. |
| `pending` | Payload persistido, aguardando processamento. |
| `sending` | Intenção de envio persistida e tentativa em andamento. |
| `retry_wait` | Nova tentativa permitida após uma resposta que garante ausência de gravação, ou lookup inicial indisponível. |
| `reconciling` | Resultado incerto: apenas consultar o ERP, sem repetir o POST. |
| `sent` | Pedido identificado no ERP; `erpOrderId` disponível. |
| `failed` | Falha definitiva ou conflito de integridade, com `lastError`. |

Antes de enviar, o worker procura pedidos pelo identificador externo. Um resultado existente encerra a submissão com o ID encontrado; múltiplos resultados são falha de integridade. `422` é permanente; `400` e `401` também encerram tentativas sabidamente rejeitadas. `429` respeita `Retry-After`; `503` permite retry porque o contrato do simulador garante que nada foi gravado. O backoff começa em um segundo e cresce até 60 segundos; `Retry-After` pode exigir espera maior.

O cliente HTTP limita a chamada completa a cinco segundos, incluindo a leitura do corpo. Timeout, conexão interrompida, sucesso malformado ou resposta sem garantia de não gravação levam à reconciliação. Um GET vazio **não prova** que um POST anterior nunca concluirá. Por isso, a submissão permanece em `reconciling` enquanto o resultado for desconhecido, inclusive se o processo caiu entre gravar a intenção e executar o POST. Essa escolha pode exigir investigação operacional e sacrifica progresso automático para preservar a ausência de duplicatas. Não existe um limite de tentativas que libere uma segunda submissão insegura.

### Domínio e compatibilidade dos dados

Lista e detalhe usam a mesma derivação de status. A blacklist passa pela mesma normalização dos part numbers. Datas de calendário são validadas sem conversão de fuso horário. Os preços usam aritmética decimal exata com `BigInt`: arredondamento half-up do preço unitário somente no final; o total é esse preço unitário arredondado multiplicado pela quantidade, conforme a SPEC.

Quantidades inválidas, inclusive fracionárias, permanecem registradas para auditoria como itens `invalid`; somente inteiros positivos seguros chegam à cotação e ao ERP. Uma migration nativa altera a coluna legada `quantity` de `integer` para `double precision` com `USING`, preservando os valores antes do `synchronize` já existente. Ela não executa um downgrade que descarte frações.

Se uma base antiga tiver RFQs ou linhas duplicadas, a criação das constraints pode impedir a inicialização. Não há exclusão ou consolidação automática: inspecione os registros, faça backup e decida manualmente qual histórico preservar. O uso de `synchronize` continua sendo dívida para produção, detalhada abaixo.

## 3. Suposições

- `eventId` identifica globalmente uma entrega e não é reutilizado para outro evento de negócio. Repetições desse ID são reconhecidas sem reaplicação.
- O primeiro evento de criação que concluir a serialização define o conteúdo original. Nenhum reenvio posterior o substitui.
- Cancelamento é terminal; um item originalmente `invalid` continua `invalid`. Cancelamentos concorrentes têm motivo escolhido de forma determinística por `occurredAt` e, em empate, `eventId`.
- Tipos ou campos estruturais inválidos são rejeitados antes da persistência. Dados de item com tipo correto, mas inválidos para o domínio, permanecem como itens `invalid`, conforme as regras da spec.
- A garantia de retry seguro de `503` é específica do contrato fornecido. Outro ERP precisaria ter esse comportamento confirmado antes de reutilizar a decisão.
- O ERP deve manter e permitir consultar pedidos já aceitos. Como o simulador é volátil, reiniciá-lo remove essa evidência; a aplicação não tenta recriar pedidos perdidos dessa forma.
- A aplicação opera em ambiente local de avaliação. Login, múltiplos fornecedores por item, alteração de pedidos já enviados e infraestrutura pública estão fora do escopo.

## 4. Problemas encontrados: impacto e tratamento

### Corrigidos nesta implementação

| Problema observado | Impacto | Correção e razão |
| --- | --- | --- |
| Consulta antes de inserir sem unicidade no banco. | Entregas concorrentes podiam criar o mesmo RFQ mais de uma vez. | Constraints, ledger e serialização transacional; a exclusão vale entre processos. |
| Cancelamentos ignorados e sem memória de entregas antecipadas. | Cotação de itens cancelados e resultado dependente da ordem de chegada. | Eventos persistidos e cancelamentos aplicados também na criação posterior. |
| Regra de status duplicada na listagem. | Lista e detalhe podiam discordar sobre um RFQ. | Uma função de derivação para ambos. |
| Blacklist comparada sem normalização equivalente. | Peças bloqueadas podiam permanecer cotáveis. | Normalização consistente dos dois lados. |
| Datas convertidas por fuso e aceitação de datas inexistentes. | Mudança de dia ou necessidade de entrega inválida. | Validação de calendário e saída `YYYY-MM-DD` estável. |
| Preço calculado com ponto flutuante binário. | Arredondamento incorreto, como `1.005` para `1.00`. | Cálculo decimal exato e regressões do exemplo financeiro da SPEC. |
| Campos opcionais omitidos numa recotação podiam deixar encargos antigos armazenados. | Dados exibidos e preço recalculado ficavam inconsistentes. | Encargos omitidos são persistidos como zero. |
| Validação incompleta de payload, paginação e número de linha da rota. | Entradas inválidas, inconsistência e erros do banco expostos como falha interna. | Validação na fronteira HTTP, limites compatíveis com o armazenamento e respostas `400`. |
| Proteção incompleta de rotas e configuração ausente descoberta durante o uso. | Acesso indevido ou falhas tardias sem diagnóstico claro. | Chave obrigatória, HMAC e validação de configuração antes de atender. |
| Cliente ERP sem limite de tempo, classificação de erro ou persistência do envio. | Reenvio de pedidos já gravados e perda de progresso em reinícios. | Worker durável, timeout, respostas tipadas, backoff e reconciliação. |
| Listagem limitada à primeira página e detalhe sem acompanhar o ERP. | RFQs inacessíveis pela navegação e estado de envio desatualizado. | Paginação, atualização durante processamento e feedback textual de loading/erro. |

Na evolução do schema, a revisão identificou que confiar apenas no `synchronize` para mudar o tipo de `quantity` poderia recriar a coluna e perder dados. A migration de conversão foi acrescentada e verificada com dados legados. Na entrega ao ERP, um teste de falha ao liberar o advisory lock também revelou retenção de sessão; a conexão é encerrada nessa situação antes de retornar ao pool.

### Pendências e limites conhecidos

| Pendência | Impacto | Recomendação |
| --- | --- | --- |
| `synchronize: true` permanece na configuração herdada. | Mudanças de entidade podem alterar o schema automaticamente; duplicatas antigas impedem novas constraints. | Adotar migrations explícitas para todo o schema, com backup, inspeção de duplicatas e implantação controlada antes de produção. |
| ERP simulado em memória, com rotas administrativas próprias sem autenticação. | Reinício/reset perde pedidos e exposição de rede permite acesso aos dados de teste. | Mantê-lo local e preservar a instância durante a avaliação; usar persistência e proteção no ERP real. |
| Resultado incerto com lookup permanentemente vazio. | A submissão pode ficar indefinidamente em reconciliação, inclusive após queda antes do POST. | Investigar no ERP e aprimorar seu contrato com idempotência/unicidade ou confirmação definitiva de ausência; não liberar repost automático por tempo decorrido. |
| Chave compartilhada e proxy de desenvolvimento sem identidade de usuário. | Acesso ao proxy equivale a acesso às rotas que ele encaminha. | Restringir o ambiente local; antes de publicar, usar proxy protegido, TLS, autenticação e gestão de segredos. |
| `/health` verifica apenas a resposta do processo. | Um `200` não confirma disponibilidade do banco ou do ERP. | Acrescentar readiness com dependências e monitoramento operacional quando houver implantação. |
| Ledger e submissões não têm política de arquivamento; há logs, sem alertas ou métricas dedicados. | Crescimento do banco e investigação manual de envios travados. | Definir retenção que preserve a identidade já processada e alertas para idade de reconciliação, falhas e retries. |

## 5. O que faria com mais tempo

Priorizaria migrations completas e um procedimento de atualização de bases existentes, seguidos de observabilidade do worker e um fluxo operacional de reconciliação. A melhoria decisiva para disponibilidade seria negociar com o ERP uma chave idempotente realmente única e persistente: isso permitiria recuperar também os resultados hoje impossíveis de determinar com segurança.

Para uma implantação, adicionaria readiness, backup/restauração verificáveis, autenticação no acesso à interface e configuração de rede/proxy apropriada. Também automatizaria em CI os testes reais de PostgreSQL, os builds e as verificações de navegação, teclado e responsividade já previstas no handoff. Esses itens são próximos passos, não funcionalidades entregues.

## 6. Como usei IA

O trabalho foi desenvolvido com Codex, da família GPT-6, com agentes separados para domínio, ERP, interface, revisão e documentação. O coordenador inspecionou a arquitetura, definiu contratos e limites de arquivos, integrou as branches e executou a validação conjunta. Agentes escritores trabalharam em worktrees isoladas; seus relatos de sucesso não substituíram a revisão e a execução dos testes pelo coordenador.

O contexto reuniu a SPEC original, o pedido complementar, as regras do usuário e a constituição do projeto. O uso e a inicialização do **Spec Kit 1.0.3** foram aprovados pelo usuário; sua versão foi mantida fixa. A spec, as decisões, os contratos e o tracker ficam em [specs/001-aloia-rfq-reliability/](specs/001-aloia-rfq-reliability/), com a constituição em [.specify/memory/constitution.md](.specify/memory/constitution.md). O contexto versionado para retomada está em [AGENT.md](AGENT.md).

Foram usados ciclos RED/GREEN para comportamentos novos e correções: observar a falha, aplicar a menor mudança e executar novamente. Testes reais confrontaram sugestões da IA com o comportamento do PostgreSQL e da rede. Entre os ajustes identificados na revisão e validação estão a migration que preserva quantidades, os limites numéricos das rotas, o arredondamento decimal, a remoção de encargos antigos na recotação e a liberação de sessões quando o unlock falha. A lógica de reconciliação foi mantida conservadora porque um GET vazio não torna seguro repetir um POST incerto.

O [handoff](outputs/aloia-rfq-handoff.md) registra o que foi executado, as evidências, os arquivos alterados e os limites da verificação. A IA auxiliou na implementação e análise; a evidência da entrega são os resultados observados e o código versionado.
