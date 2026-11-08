# Teste Técnico ALOIA

Felipe Augusto Medici

## Problemática geral

- Cancelamento de cotações: o cliente gera pedidos de cotação, mas, mesmo após o cancelamento, eles continuam sendo processados.
- Integração com ERP: após a cotação ser finalizada, os dados não são enviados automaticamente ao ERP, sendo necessário digitá-los novamente.
- Dados do sistema CLIENTE: existem dados duplicados e desorganizados, dificultando a consistência e o controle das informações.
- Limitações do ERP: o ERP possui limites de requisições e apresenta falhas que geram gargalos, aumentando o tempo entre o envio das informações e o recebimento das respostas.

## Passos que adotei

### 1. Análise inicial e levantamento de dúvidas

- Anotar as dúvidas que surgirem durante meu entendimento inicial do projeto e consultar a IA para verificar se já existem informações no repositório que possam respondê-las. Caso não existam, encaminhá-las ao Leobaldo.
- Pedir para a IA analisar toda a base do repositório, identificando possíveis dúvidas e pontos de atenção, com foco nas problemáticas listadas, tanto em questões estruturais e arquiteturais quanto de código e lógica de negócio.
- Consolidar minhas dúvidas com as identificadas pela IA, filtrar o que ainda precisa de esclarecimento e encaminhar ao Leobaldo.
- Rodar a aplicação localmente para visualizar o sistema, entender os fluxos existentes e identificar o que já está implementado.

### 2. Planejamento e definição da solução

- Enquanto aguardo as respostas, começo a estruturar a spec de implementação, definindo os objetivos (goals) de cada problemática e como pretende resolvê-los.
- Antes de fechar a especificação, validar se a abordagem que estou propondo faz sentido, tanto em termos de lógica de negócio quanto de arquitetura, considerando os requisitos e o objetivo final.
- Com os objetivos e a abordagem definidos, estabelecer os critérios de sucesso e falha, deixando claro o comportamento esperado da implementação e como vou validá-lo. Isso inclui cenários de idempotência, prevenção de envios duplicados, tratamento de falhas e situações em que o sistema deve rejeitar ou interromper uma operação.
- Desenhar o System Design, representando a arquitetura e os principais fluxos das regras de negócio, para servir como base da implementação.

### 3. Especificação e implementação

- Escrever a spec final para o agente, detalhando o objetivo, as regras de negócio, a estrutura esperada, as restrições e os critérios de validação.
- Acompanhar e revisar a implementação entregue pelo agente, realizando testes e ajustando o que for necessário.
- Questionar e validar as regras de negócio implementadas, verificando se meu entendimento inicial foi correto e se a solução está coerente com o que foi solicitado.

### 4. Revisão técnica e documentação

- Fazer uma revisão do código, avaliando a lógica implementada, a organização, as decisões arquiteturais e se a estrutura utilizada realmente faz sentido para o problema.
- Revisar os cenários de sucesso e erro definidos na spec, validando se o comportamento final corresponde ao esperado.
- Por fim, atualizar os arquivos .md, incluindo o README e as instruções dos agentes, para documentar exatamente o que foi implementado, como funciona e quais decisões foram tomadas.
