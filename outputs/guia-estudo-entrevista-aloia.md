# Guia de estudo — entrevista técnica ALOIA RFQ

Perguntas e respostas para explicar o problema, a arquitetura, a implementação e o uso de IA no desafio. As respostas estão em primeira pessoa para facilitar o ensaio. Adapte a linguagem à sua experiência, mantendo as garantias e os limites descritos.

## Lembrete: qual era o problema?

A ALOIA recebe solicitações de cotação de peças aeronáuticas. Cada solicitação, chamada **RFQ** (*request for quotation*), contém itens que o comprador precisa avaliar e cotar.

O serviço já recebia eventos de criação, normalizava itens, permitia cotação pela API e mostrava solicitações em uma interface React. Faltavam duas partes para fechar o fluxo:

- **Tratar cancelamentos:** o cliente cancelava itens, mas o sistema continuava permitindo seu processamento.
- **Integrar a cotação com o ERP:** a cotação pronta precisava ser redigitada manualmente no sistema de destino.

Esses problemas eram agravados pelo comportamento dos sistemas externos:

- O cliente podia entregar eventos repetidos, simultâneos ou fora de ordem.
- O ERP podia limitar requisições, falhar ou gravar o pedido e demorar para responder.
- O ERP **não garantia unicidade de `externalId`**. Repetir um envio poderia criar outro pedido.

## O que fiz para resolver, no geral

**Mantive a arquitetura existente e acrescentei controle persistente para o recebimento dos eventos e para o envio ao ERP.**

1. Registrei eventos com `eventId` único no PostgreSQL, aplicando o efeito de negócio na mesma transação.
2. Preservei apenas a primeira criação de cada `rfqId`, mesmo quando outra criação chega com um novo evento.
3. Guardei cancelamentos antecipados para aplicá-los quando a RFQ existir.
4. Coordenei operações concorrentes com locks por RFQ.
5. Permiti a primeira submissão somente quando a cotação está `READY`.
6. Criei uma submissão única por RFQ com uma cópia apenas dos itens cotados.
7. Implementei processamento assíncrono, tentativas seguras e reconciliação de resultados incertos.
8. Melhorei a listagem, a navegação e a apresentação dos estados de cotação e envio.
9. Corrigi problemas de normalização, datas, preços e validação relevantes para o fluxo.
10. Verifiquei regras com testes de sucesso, falha e concorrência, incluindo PostgreSQL real.

### Explicação de abertura em aproximadamente um minuto

> O desafio era completar um serviço de RFQ existente, tratando cancelamentos e integrando a cotação pronta com o ERP. O principal risco era a inconsistência: o cliente repetia e reordenava eventos, enquanto o ERP podia gravar um pedido sem responder a tempo. Mantive a stack e usei o PostgreSQL para unicidade, transações e controle de concorrência. Separei o histórico dos eventos do controle de envio ao ERP. Quando a cotação fica pronta e o operador solicita o envio, salvo uma cópia dos itens cotados e um worker processa essa entrega. Falhas comprovadamente transitórias permitem nova tentativa; resultados incertos levam à consulta do ERP, sem repetir o POST às cegas. A interface mostra esse progresso e deixa claro que uma cotação pronta ainda não é um pedido confirmado.

### Fluxo para memorizar

```text
Cliente envia webhook
        ↓
API autentica e valida
        ↓
Registra o evento e aplica criação/cancelamento em transação
        ↓
Comprador trata os itens: cotar ou não cotar
        ↓
RFQ sem pendências e com pelo menos um item cotado → READY
        ↓
Operador solicita envio
        ↓
Submissão única com snapshot apenas dos itens quoted
        ↓
Worker consulta o ERP e envia quando é seguro
        ↓
Confirmação, nova tentativa segura, reconciliação ou falha definitiva
        ↓
Interface apresenta o estado persistido
```

### Distinções que não posso confundir

| Conceito | Significado |
| --- | --- |
| `eventId` | Identifica um evento recebido; é tratado como globalmente único. |
| `rfqId` | Identifica a solicitação de negócio. |
| Evento concluído | A entrega foi processada e sua transação terminou. |
| RFQ `READY` | A cotação está pronta para solicitar envio. |
| Submissão `sent` | O pedido foi confirmado pelo ERP. |
| HTTP `202` | A solicitação foi aceita para processamento. |
| Timeout | A resposta não chegou no prazo; o efeito pode ter acontecido. |
| Reconciliação | Consultar o ERP para esclarecer um resultado incerto. |

## Índice

- [Problema, fluxo e arquitetura — perguntas 1 a 5](#problema-fluxo-e-arquitetura)
- [Eventos, idempotência e domínio — perguntas 6 a 13](#eventos-idempotência-e-domínio)
- [Integração e confiabilidade — perguntas 14 a 22](#integração-e-confiabilidade)
- [Interface e experiência de uso — perguntas 23 a 27](#interface-e-experiência-de-uso)
- [Preços, segurança e validação — perguntas 28 a 30](#preços-segurança-e-validação)
- [Uso de IA e decisões — perguntas 31 a 35](#uso-de-ia-e-decisões)
- [Aprofundamentos pedidos depois — perguntas 36 e 37](#aprofundamentos-pedidos-depois)

## Problema, fluxo e arquitetura

### 1. Qual era o problema de negócio e o que sua solução resolveu?

O sistema já recebia solicitações de cotação, mas ignorava cancelamentos de itens e não fechava a integração com o ERP. Isso gerava trabalho em itens cancelados e redigitação de cotações prontas.

Além disso, o cliente entregava eventos repetidos, simultâneos e fora de ordem. O ERP podia falhar ou gravar um pedido sem responder a tempo. Minha solução tratou esses problemas preservando o histórico, controlando a concorrência e acompanhando o envio até sua confirmação ou falha. Quando não é possível determinar o resultado com segurança, mantém a reconciliação.

### 2. Por que não separou em microsserviços ou adicionou uma fila externa?

O desafio não demonstrava uma necessidade de escala ou isolamento que justificasse essa infraestrutura. Mantive uma aplicação organizada por responsabilidades e um worker dentro do Nest, com progresso persistido no PostgreSQL.

Uma fila externa poderia ajudar na distribuição do trabalho, mas não resolveria sozinha a duplicação no ERP nem o resultado incerto de uma chamada HTTP. Eu reconsideraria essa escolha diante de volume maior, necessidade de escalar o worker separadamente ou isolamento operacional.

### 3. Como você dividiu as responsabilidades no código?

Os controllers recebem requisições, aplicam autenticação e validação e encaminham as operações. O serviço de RFQ concentra as regras de criação, cancelamento, cotação, status e submissão.

O cliente ERP cuida da comunicação HTTP e da interpretação das respostas. O worker decide quando processar, tentar novamente ou reconciliar.

A interface apresenta o estado e solicita ações. As regras decisivas continuam no servidor, para funcionar mesmo quando alguém chama a API diretamente.

### 4. Por que criou duas tabelas, rfq_event e rfq_submission?

Porque representam operações diferentes.

`rfq_event` registra o que chegou do cliente: criação e cancelamento. Já `rfq_submission` controla a entrega de uma cotação ao ERP, incluindo conteúdo enviado, tentativas, próxima execução, erros e confirmação.

Um webhook pode terminar de ser processado muito antes de a cotação ficar pronta. Separar essas responsabilidades evita que “concluído” signifique coisas diferentes no mesmo registro.

| Registro | Responsabilidade |
| --- | --- |
| `rfq` | Identidade e dados da solicitação |
| `rfq_item` | Itens, tratamento e cotação |
| `rfq_event` | Eventos recebidos e deduplicação |
| `rfq_submission` | Conteúdo congelado e progresso do envio |

### 5. Isso é Event Sourcing?

Não é Event Sourcing completo. Existe um registro persistente dos eventos recebidos, usado para deduplicação, rastreabilidade e cancelamentos fora de ordem.

Mas o estado operacional também fica nas tabelas de RFQ e itens. Além disso, ações como cotar e marcar “não cotar” não geram eventos nesse registro. Eu não apresentaria essa implementação como um sistema em que todo o estado é reconstruído exclusivamente a partir de eventos.

## Eventos, idempotência e domínio

### 6. Como você impede o processamento repetido do mesmo evento?

O `eventId` é único no banco. Tento inseri-lo dentro da mesma transação que aplica o efeito de negócio.

Se a inserção encontra um registro existente, o evento não é reaplicado e a API responde normalmente. Se qualquer alteração da transação falhar, o registro do evento também é desfeito, permitindo uma reentrega.

Isso evita marcar um evento como processado sem que seu efeito tenha sido confirmado.

### 7. Por que não consultar se o evento existe antes de inserir?

Porque existe uma corrida entre a consulta e a gravação. Duas requisições simultâneas podem consultar, ambas encontrar ausência e ambas tentar processar.

A decisão precisa ser arbitrada pelo banco por meio da unicidade. A consulta isolada não oferece essa garantia.

Esse foi um refinamento concreto da abordagem inicial: substituir “consultar e depois registrar” por uma inserção única transacional.

### 8. Se eventId já é único, por que também controlar rfqId?

Porque são identidades diferentes. `eventId` identifica um evento; `rfqId` identifica a solicitação de negócio.

O cliente pode mandar outra criação da mesma RFQ com um novo `eventId`. Nesse caso, registro esse novo evento, mas não recrio nem sobrescrevo a solicitação.

A primeira criação efetivamente processada vence. Isso não significa escolher posteriormente a criação com o menor `occurredAt`.

### 9. Como funciona o cancelamento que chega antes da criação?

Registro o cancelamento mesmo quando a RFQ ainda não existe. Quando a criação chega, aplico os cancelamentos conhecidos aos itens, dentro da transação.

Assim não dependo da ordem da rede, não preciso manter uma requisição esperando e não crio uma RFQ incompleta. O registro do evento se associa à solicitação por `rfqId`, sem exigir que ela já exista.

Se o cancelamento mencionar uma linha que nunca existe, o evento permanece registrado. Se o item já for inválido, ele continua inválido, conforme a regra definida.

### 10. Como você evita conflito entre cotar, cancelar e enviar ao mesmo tempo?

As alterações usam um lock transacional por RFQ. Isso serializa operações concorrentes daquela solicitação. O lock é associado ao identificador e funciona inclusive antes de existir uma linha de RFQ no banco.

Se a cotação ocorrer primeiro, o cancelamento pode mudar o item para cancelado depois. Se o cancelamento ocorrer primeiro, a tentativa de cotar encontra o estado final e é rejeitada.

Esse lock também coordena a criação do snapshot de envio com alterações nos itens. A proteção está no backend; desabilitar botões é apenas uma parte da experiência.

### 11. Por que preservar o dado original e guardar o normalizado ao lado?

O original permite investigar exatamente o que o cliente enviou. O normalizado permite comparar e aplicar regras consistentemente.

Por exemplo, `ab-2231/04` e `AB223104` passam a representar a mesma peça. Também normalizei a blacklist com a mesma regra, para uma variação de escrita não permitir cotar uma peça bloqueada.

Essa separação mantém rastreabilidade sem obrigar as regras de negócio a trabalhar com dados inconsistentes. Itens possivelmente duplicados recebem aviso; não são apagados automaticamente.

### 12. Qual a diferença entre rejeitar um payload e registrar um item como inválido?

Um payload malformado viola o contrato da API e recebe erro de validação. Já um item estruturalmente válido pode ter um problema de negócio e ficar registrado como `invalid`, permitindo tratar os demais itens.

Por exemplo, uma quantidade enviada como string viola o formato esperado. Uma quantidade numérica não inteira é um problema de validade do item.

A data tem outra regra: uma data inexistente vira `null` com aviso. Ela não invalida automaticamente o item inteiro. A data de necessidade é tratada como data de calendário, sem conversão de fuso que possa mudar o dia.

### 13. Qual a diferença entre RFQ pronta e RFQ enviada?

`READY` representa a situação da cotação. `sent` representa a confirmação da integração com o ERP.

São dimensões diferentes. Uma cotação pode estar pronta e ainda não ter sido enviada, ou estar aguardando uma nova tentativa.

Também não confundo HTTP com resultado de negócio: o submit pode retornar `202` porque o processamento foi aceito. Uma consulta de submissão encerrada pode retornar `200` mesmo quando seu estado é `failed`. É preciso interpretar o corpo.

## Integração e confiabilidade

### 14. Por que escolheu envio assíncrono?

Porque o ERP é lento e pode exigir espera, novas tentativas e reconciliação. Não faria sentido manter a requisição do usuário aberta durante todo esse processo.

A API registra a intenção de envio no banco e responde. O worker continua o trabalho independentemente da página aberta.

O custo dessa escolha é precisar modelar estados intermediários e explicar o progresso na interface. Em troca, o processamento pode continuar e ser retomado após reinício.

### 15. O envio acontece automaticamente quando a RFQ fica pronta?

Não. Na implementação atual, o operador inicia o envio pelo botão ou pelo endpoint.

Depois dessa solicitação, o processamento, as tentativas seguras e a reconciliação são automáticos.

Essa distinção preserva uma ação explícita de envio. Submeter automaticamente quando a RFQ chegar a `READY` seria outra decisão de produto, que precisaria ser especificada.

### 16. Por que salvar um snapshot dos itens cotados?

Para preservar exatamente o conteúdo autorizado para envio.

Se o worker reconstruísse o pedido a partir dos itens atuais em cada tentativa, uma alteração entre tentativas poderia mudar o conteúdo da mesma operação.

O snapshot contém apenas os itens `quoted`. Os cancelados, inválidos e não cotados continuam no histórico e no detalhe, mas não entram no pedido do ERP.

### 17. O que acontece se o usuário clicar duas vezes ou duas instâncias processarem o mesmo envio?

A submissão é única por `rfqId`. A criação ocorre sob lock, e uma chamada repetida retorna a submissão existente.

No worker, há outro lock no PostgreSQL para impedir processamento simultâneo da mesma submissão por instâncias cooperantes. Esse lock é de sessão, mantido durante o processamento e liberado ao final.

Antes de chamar o ERP, o worker persiste a intenção de envio. Se o resultado ficar incerto, ele muda para consulta e não repete o POST às cegas. São proteções complementares.

### 18. Por que você não repete o POST quando ocorre timeout?

Porque timeout significa ausência de resposta dentro do prazo, não ausência de gravação.

O ERP do desafio pode criar o pedido e demorar para responder. Como ele não garante unicidade de `externalId`, repetir o POST pode criar outro pedido.

Por isso classifico esse resultado como incerto e consulto o ERP pelo identificador externo até conseguir confirmar o que aconteceu.

### 19. Mas se a consulta não encontrou o pedido, por que não enviar novamente?

Porque uma consulta vazia não prova que a tentativa anterior deixou de executar. Ela pode ainda estar em andamento.

Priorizei evitar duplicação e aceitei que certos casos permaneçam em reconciliação e exijam investigação manual.

Existe inclusive uma janela em que a aplicação registra `sending` e cai antes de fazer a chamada. Na retomada, ela não consegue provar se enviou. Essa limitação seria melhor resolvida com idempotência garantida no próprio ERP.

> **Ponto central:** a solução troca parte da recuperação automática por segurança contra duplicação quando o resultado é desconhecido.

### 20. Como você diferencia falha permanente, transitória e resultado incerto?

A decisão depende do contrato do ERP, não apenas do código HTTP.

| Resultado do envio | Tratamento |
| --- | --- |
| `400`, `401`, `422` | Encerrar como falha definitiva |
| `429` | Reagendar, respeitando `Retry-After` |
| `503` | Reagendar, pois este contrato garante que nada foi gravado |
| Timeout ou resposta ambígua | Reconciliar por consulta, sem novo POST |
| Pedido confirmado | Registrar `sent` e o ID do ERP |

Uso backoff nas tentativas, considerando o maior prazo entre a espera calculada e `Retry-After`. Não generalizaria a regra de `503` para qualquer integração: em outro ERP, seria necessário verificar o contrato.

Na reconciliação, falhas de consulta preservam a incerteza. A ausência de confirmação não é transformada automaticamente em autorização para reenviar.

### 21. Você garante exactly-once? E o que acontece após reinício?

Não apresentaria a solução como exactly-once universal entre sistemas independentes.

A aplicação persiste o estado e evita duplicação dentro das premissas do contrato. Ao reiniciar, o worker encontra as submissões pendentes; se encontra `sending`, trata como resultado incerto e passa à reconciliação.

Essa segurança depende da coordenação no banco e do comportamento do ERP. O ERP simulado guarda pedidos em memória e perde esse histórico ao reiniciar, então ele também limita a durabilidade da demonstração.

### 22. Pode alterar a cotação ou cancelar um item depois de solicitar o envio?

A criação da submissão é o ponto de corte. Depois dela, alterações de cotação e ações de “não cotar” ficam bloqueadas.

Cancelamentos recebidos por webhook continuam sendo registrados e podem atualizar o item local, mas não modificam o snapshot nem cancelam o pedido no ERP.

Também não implementei reabertura automática após uma falha definitiva. Corrigir e reenviar a mesma RFQ precisaria de um fluxo próprio, com regras de negócio explícitas.

## Interface e experiência de uso

### 23. Por que você melhorou a listagem? Qual era o benefício para o usuário?

A listagem é o ponto de triagem do comprador. Ele precisa localizar uma solicitação, identificar o cliente e entender o que exige atenção antes de abrir o detalhe.

Por isso acrescentei filtros por cliente, RFQ e situação, ordenação, paginação e indicação do envio. A tabela permite comparar solicitações com os mesmos atributos.

O detalhe concentra itens, avisos e informações da integração. Ao voltar, os filtros e a página são preservados durante a navegação, reduzindo repetição de trabalho.

### 24. Por que aplicar filtros no servidor? Não seria mais simples filtrar no React?

Filtrar apenas os registros carregados produziria resultados incompletos. A interface carrega vinte solicitações por página; um RFQ correspondente poderia estar em outra página.

Por isso o servidor filtra e ordena o conjunto antes de paginar. Também existe um desempate estável por RFQ.

Como o status depende dos itens, uso uma projeção SQL para selecionar os resultados. Há testes de paridade com a regra de domínio para evitar divergências entre lista e detalhe. A seleção e o carregamento dos itens da página usam a mesma transação `REPEATABLE READ`, para enxergarem um retrato consistente durante alterações concorrentes.

### 25. Como a interface apresenta os estados sem confundir o operador?

Antes da submissão, a lista mostra a situação da cotação. Depois, dá destaque ao andamento do envio. No detalhe, mostro o estado da integração, tentativas, próxima execução, erro e identificador confirmado pelo ERP.

“Pronta para envio” não aparece como “enviada”. Essa última mensagem depende de confirmação.

Também usei rótulos textuais, mensagens de carregamento, erros e recursos de acessibilidade, para que o entendimento não dependa apenas da cor.

| Estado da integração | Mensagem ou significado |
| --- | --- |
| `not_sent` | Não enviado; ainda não existe submissão |
| `pending` | Aguardando processamento |
| `sending` | Enviando ao ERP |
| `retry_wait` | Nova tentativa agendada |
| `reconciling` | Confirmando recebimento por consulta |
| `sent` | Pedido confirmado pelo ERP |
| `failed` | Falha definitiva, com motivo |

O filtro da listagem considera o estado da cotação. Por isso a opção “Pronta ou enviada ao ERP” também pode incluir RFQs cujo envio já começou ou terminou, enquanto a cotação continua `READY`.

### 26. Por que polling com TanStack Query em vez de WebSocket?

A biblioteca já existia e o fluxo não precisava de atualização instantânea. No detalhe, consulto a API a cada dois segundos enquanto existe processamento ativo ou uma solicitação de envio ainda precisa ser esclarecida.

Isso atende ao acompanhamento sem adicionar uma conexão persistente e uma infraestrutura de publicação de eventos.

O custo é gerar consultas periódicas e ter algum atraso visual. Se o volume de usuários ou a exigência de latência aumentasse, eu avaliaria SSE ou WebSocket com base nessa necessidade.

### 27. O que acontece se o navegador perder a resposta do submit?

A interface não assume imediatamente que nada aconteceu. Ela continua consultando a situação para descobrir se a API registrou a submissão.

Enquanto existe incerteza, bloqueia alterações nos itens. Uma nova solicitação de submit pode consultar ou recuperar a mesma submissão, porque o backend garante sua unicidade.

É importante distinguir essa repetição do navegador para nossa API de repetir um POST incerto para o ERP: nossa API foi implementada para reconhecer a operação existente.

## Preços, segurança e validação

### 28. Como você tratou preços, quantidade mínima e arredondamento?

Segui a fórmula da especificação: considero a maior quantidade entre a solicitada e o MOQ para calcular o custo da compra, adiciono encargos e distribuo pela quantidade solicitada. Depois aplico o percentual sobre o custo e o câmbio.

Usei cálculo decimal exato com inteiros escalados e `BigInt`, evitando depender de ponto flutuante binário. O arredondamento half-up acontece no preço unitário final; o total deriva desse unitário arredondado.

O exemplo da SPEC resulta em USD 35,51 por unidade e USD 106,53 no total. Quando ocorre recotação, encargos opcionais omitidos são zerados para não reaproveitar valores antigos indevidamente.

> **Lembrete:** o campo chamado “margem” segue um acréscimo sobre o custo, conforme a fórmula fornecida. Não é uma fórmula de margem líquida sobre o preço de venda.

### 29. Como você protege as APIs? Isso já equivale a autenticação de usuários?

As rotas exigem uma chave interna. O webhook também valida HMAC-SHA256 sobre o corpo bruto, verificando integridade e autenticidade da mensagem. Acrescentar a chave ao webhook foi uma decisão adicional à especificação original.

No ambiente local, o proxy do Vite injeta a chave para ela não ficar no código do navegador.

Isso não equivale a login, identidade individual ou autorização por perfil. Esses recursos continuam fora do escopo, e o proxy precisa ser protegido antes de uma exposição pública.

### 30. Como você comprovou que resolveu o problema?

Transformei os requisitos em cenários observáveis.

Testei eventos repetidos e simultâneos, cancelamento antes da criação, rollback, conflitos entre operações e submissões concorrentes. Na integração, testei respostas permanentes, falhas transitórias, timeout depois de gravação e retomada após falhas.

Os testes de integração usam PostgreSQL real, porque mocks não demonstrariam corretamente as garantias de unicidade e locks. Na execução realizada durante esta preparação, em **15/11/2026**, passaram **347 testes em 13 suítes**, com `npm test -- --runInBand`.

Isso é evidência dos cenários cobertos, não prova de ausência de defeitos. Também não equivale a um teste de carga ou a uma certificação de prontidão para produção.

## Uso de IA e decisões

### 31. Como você usou IA durante o desenvolvimento?

Usei Codex para investigar a base, levantar dúvidas, discutir alternativas, implementar e revisar.

Estruturei objetivos, restrições e critérios no `AGENT.md`, e usei Spec Kit para organizar especificação, decisões e tarefas. O trabalho foi dividido entre frentes de domínio, integração e interface, com revisão e integração coordenadas.

A IA ajudou na execução, mas a aceitação dependia de coerência com o problema, revisão do código e testes de sucesso, falha e concorrência.

### 32. Por que usar especificação e agentes separados em vez de um único prompt pedindo tudo?

Porque o desafio tinha regras que interagiam: cancelamento, concorrência, cotação e envio. Uma especificação explícita ajudou a manter essas regras consistentes e verificáveis durante as mudanças.

Agentes separados permitiram trabalhar em áreas independentes, mas criaram a necessidade de revisar os contratos e testar o resultado integrado.

O valor não estava em ter mais agentes. Estava em limitar responsabilidades e exigir evidências antes de integrar o trabalho.

### 33. Como você evita que a IA produza testes que apenas confirmem o próprio código?

Parto das regras e dos resultados esperados, não da estrutura interna da implementação.

Por exemplo: dez entregas simultâneas precisam produzir um único efeito; cancelamento antecipado precisa prevalecer depois da criação; timeout após gravação não pode gerar outro pedido.

Também verifico efeitos persistidos e chamadas ao ERP, em vez de conferir apenas o status HTTP. Revisão independente ajuda, mas continuo precisando entender por que cada cenário demonstra uma propriedade relevante.

### 34. O que você faria diferente ou priorizaria com mais tempo?

Priorizaria melhorias ligadas aos riscos restantes: idempotência garantida no ERP, visibilidade operacional das reconciliações e regras de correção após falha definitiva.

Para produção, substituiria a sincronização automática de schema por migrations controladas, acrescentaria readiness das dependências e proteção de acesso adequada.

Também ampliaria os testes automatizados da interface em CI. Um formulário de cotação entraria conforme a necessidade do comprador. Não começaria adicionando infraestrutura sem evidência de necessidade.

### 35. Qual foi o principal trade-off da sua solução?

Priorizei consistência e prevenção de duplicação diante de um ERP que não oferece idempotência.

Isso simplificou algumas escolhas, como usar o PostgreSQL existente para coordenação, mas trouxe um limite importante: quando o resultado do envio é desconhecido, posso precisar manter a reconciliação sem reenviar.

A solução resolve os cenários definidos com essa escolha explícita. Para melhorar a recuperação automática com segurança, o contrato do ERP precisa evoluir.

## Aprofundamentos pedidos depois

As duas perguntas abaixo reforçam os temas aprofundados após o roteiro inicial. Elas reúnem a explicação completa e a comparação com alternativas, para ensaiar uma resposta contínua.

### 36. O desafio exige idempotência. Como sua implementação resolve isso e por que você escolheu essa abordagem em vez de outra?

Idempotência significa que repetir a mesma operação não produz efeitos adicionais. Neste desafio, o cliente pode entregar o mesmo evento várias vezes, inclusive simultaneamente. O resultado precisa continuar sendo uma única aplicação daquele evento.

Resolvi isso usando **unicidade e transações no PostgreSQL**. Cada evento tem um `eventId` único. A aplicação tenta registrá-lo na mesma transação que cria a RFQ ou aplica o cancelamento. Somente a requisição que consegue inserir esse identificador processa o evento. As repetições recebem uma resposta de sucesso, mas não reaplicam a alteração.

Se o processamento falhar, a transação desfaz tanto o registro quanto suas alterações. Assim, uma reentrega pode tentar novamente, sem o evento ficar indevidamente marcado como concluído.

Também trato uma segunda identidade: o `rfqId`. Mesmo que o cliente envie outro evento de criação com um `eventId` diferente, a mesma RFQ não pode ser recriada. A unicidade e o lock por RFQ protegem essa regra.

Escolhi essa abordagem porque o banco já existia e consegue arbitrar a concorrência entre diferentes instâncias da aplicação. Não depende de uma única execução nem perde o registro quando o processo reinicia.

**E por que não outra solução?**

Consultar antes de inserir não basta: duas requisições podem consultar simultaneamente e ambas concluir que o evento não existe.

Guardar os IDs em memória perde a proteção após reinício e não coordena diferentes instâncias. Redis ou uma fila poderiam participar de outra arquitetura, mas acrescentariam infraestrutura e ainda exigiriam coordenar a deduplicação com a gravação do efeito de negócio. Aqui, a transação no banco resolve os dois juntos.

**E a idempotência no envio ao ERP?**

No envio, mantenho uma submissão única por RFQ, então cliques repetidos retornam a mesma operação. Como o ERP não garante unicidade, após timeout eu consulto o pedido sem repetir o POST. O limite dessa escolha é poder permanecer em reconciliação: priorizei evitar duplicatas, sem prometer uma garantia universal de execução exatamente uma vez entre os dois sistemas.

**Exemplo para explicar oralmente:** se o mesmo cancelamento chegar dez vezes, o item deve terminar cancelado por uma única aplicação do evento. Se o envio ao ERP perder a resposta, repetir cegamente a chamada pode criar dois pedidos; por isso esse caso exige reconciliação, além da deduplicação local.

### 37. Por que você criou duas tabelas para controlar o estado? Não poderia usar apenas uma?

Separei porque elas controlam processos diferentes, com ciclos de vida e regras próprias.

A **`rfq_event`** registra os eventos recebidos do cliente, como criação e cancelamento. Ela permite identificar eventos repetidos e guardar cancelamentos que chegam antes da criação da RFQ. Uma RFQ pode ter vários eventos.

A **`rfq_submission`** controla a entrega da cotação ao ERP. Ela guarda o conteúdo separado para envio, as tentativas, a próxima execução, os erros e o identificador confirmado pelo ERP. Na regra atual, cada RFQ pode ter no máximo uma submissão.

A distinção principal é que **processar um evento não significa concluir a cotação nem enviá-la ao ERP**. O evento de criação pode estar concluído enquanto os itens ainda aguardam cotação. Depois, o envio pode ficar esperando uma nova tentativa sem que seja necessário reprocessar aquele evento.

**Mas por que não colocar tudo na mesma tabela?**

Seria possível, mas misturaria registros com significados e restrições diferentes. Um `completedAt`, por exemplo, significaria processamento do webhook ou confirmação do ERP? A unicidade seria por evento ou por RFQ?

Com duas tabelas, cada operação tem uma identidade e um estado claros. Consigo concluir o recebimento independentemente do envio e retomar a integração sem reaplicar eventos do cliente.

O custo é manter duas estruturas relacionadas pelo `rfqId`, mas essa separação corresponde a duas responsabilidades reais do problema.

| Comparação | rfq_event | rfq_submission |
| --- | --- | --- |
| Origem | Evento recebido do cliente | Solicitação de envio pelo operador/API |
| Identidade | `eventId` | `rfqId` |
| Quantidade por RFQ | Vários eventos | No máximo uma submissão |
| Conteúdo | Payload original do evento | Snapshot dos itens cotados |
| Conclusão | Processamento transacional do evento | Envio confirmado ou falha definitiva |
| Existe antes da RFQ? | Pode existir, no cancelamento antecipado | É criada após validar a RFQ pronta |
| Responsabilidade | Deduplicação e tratamento dos eventos | Tentativas, reconciliação e resultado do ERP |
