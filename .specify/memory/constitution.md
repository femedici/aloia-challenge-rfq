<!-- Sync impact: scaffold -> 1.0.0. Principles derive from the attached user spec,
confirmed as the governing focus on 2026-11-07. Added scope, architecture, tests,
security, delivery and governance; removed template examples. No deferred placeholders. -->
# Aloia RFQ Constitution

## Core Principles

### I. Fidelidade à especificação
Cobrir os 14 requisitos principais e as 11 melhorias secundárias do pedido. Manter
as decisões aprovadas na spec viva. Não acrescentar funcionalidades fora do escopo
nem declarar planejamento como entrega.

### II. Arquitetura existente e menor mudança correta
Preservar NestJS, TypeORM/PostgreSQL, React/Vite e o padrão controller/service/entity.
Reutilizar funções e dependências existentes antes de criar abstrações ou bibliotecas.
Cada mudança deve resolver um requisito identificado, sem overengineering.

### III. Testes de sucesso e falha
Usar RED/GREEN para comportamento novo e correções não triviais. Cada regra deve ter
cenários positivos e negativos pertinentes. Validar concorrência real no PostgreSQL
e ausência de pedidos duplicados no ERP, incluindo chaos. Medir cobertura; não
confundir cobertura medida com prova absoluta de correção.

### IV. Segurança e integridade
Validar entradas e configuração, exigir X-Api-Key nos endpoints da aplicação e manter
a assinatura do webhook. Não registrar segredos. Repetições e respostas incertas não
podem duplicar RFQs ou pedidos. Preservar dados originais, itens e histórico de eventos.

### V. Entrega verificável
Executar testes, builds e validação local da interface. Documentar decisões e problemas
remanescentes com impacto e recomendação. Entregar rastreabilidade requisito/código,
inventário de arquivos, tabelas, entidades e endpoints, README, AGENT.md e handoff.

## Restrições do escopo
A lógica deve estar validada antes da melhoria visual inspirada na Aloia Aerospace.
Não implementar login, múltiplos fornecedores por item ou alteração/cancelamento de
pedidos já enviados ao ERP. Não modificar o ERP simulado para facilitar os testes.

## Fluxo de desenvolvimento
A spec viva e seu tasks.md são a fonte de verdade. O coordenador integra alterações
de agentes em worktrees isoladas e só conclui tarefas após revisar o diff e validar.
Preservar dados locais e mudanças preexistentes. Commit e push da branch de trabalho
estão autorizados; merge, deploy e limpeza de worktrees não estão.

## Governance
Esta constituição registra os princípios do pedido do usuário. Mudanças de escopo
exigem decisão explícita e atualização dos artefatos afetados. Aplicar versionamento
semântico: major para incompatibilidades, minor para princípios novos, patch para
clareza. Revisões devem conferir a spec e evidências antes de declarar conclusão.

**Version**: 1.0.0 | **Ratified**: 2026-11-07 | **Last Amended**: 2026-11-07
