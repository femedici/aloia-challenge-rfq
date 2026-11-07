# Especificação orientadora — desafio Aloia RFQ

<objetivo>
Implementar integralmente os itens principais e secundários abaixo no repositório Aloia.
Validar cenários de sucesso e de falha de cada regra, inclusive concorrência, idempotência,
cancelamento e integração com o ERP. Continuar até concluir a implementação e a validação.
Relatar a cobertura medida com honestidade: testes aprovados não provam ausência absoluta de defeitos.
</objetivo>

<restricoes>
Seguir a organização, os controllers, os services, o estilo e a arquitetura existentes.
Escrever código limpo, claro e bem estruturado. Cada alteração deve resolver um problema
listado; não implementar funcionalidades extras, abstrações especulativas ou overengineering.
</restricoes>

## Requisitos principais

1. **Cancelamento de item:** suportar o evento POST `rfq.item_canceled` e todos os requisitos
   de cancelamento da SPEC. Conforme a decisão aprovada, o status persistido é `canceled`,
   já definido no projeto; `rfq.item_canceled` é o tipo de evento.
2. **Idempotência de eventos:** ignorar o mesmo `eventId` em todas as repetições, simultâneas
   ou posteriores, respondendo 2xx. A proposta inicial é consultar o ID e registrá-lo em uma
   tabela de processamento com timestamp de entrada. Manter a linha após a conclusão e
   registrar também o timestamp de término. Avaliar a arquitetura e comunicar alternativas
   melhores. A solução aprovada usa inserção única transacional, pois GET seguido de POST
   não impede uma corrida concorrente.
3. **Não recriar RFQs:** aceitar apenas a primeira criação de um `rfqId`, mesmo que as
   posteriores tenham outro `eventId`. Validar o identificador e adotar a solução adequada
   à arquitetura existente.
4. **Eventos fora de ordem:** aplicar uma solução lógica para que o estado final seja
   independente da ordem de entrega, inclusive cancelamento antes da criação. Explicar a decisão.
5. **Envio ao ERP:** implementar `POST /rfqs/:rfqId/submit`, permitido inicialmente apenas em `READY`.
6. **Itens enviados:** incluir somente itens `quoted` no pedido do ERP. Avaliar o melhor
   formato de retorno; a decisão aprovada preserva as entidades e cria um snapshot separado
   com os itens cotados, sem excluir cancelados ou não cotados do histórico/detalhe.
7. **Pedido único:** repetição de chamadas, concorrência e problemas na resposta do ERP
   nunca devem criar dois pedidos para o mesmo RFQ.
8. **Situação no detalhe:** `GET /rfqs/:rfqId` deve distinguir não enviado, em andamento ou
   aguardando tentativa, enviado com ID e falha definitiva com motivo.
9. **Modo chaos:** suportar 422, 429, 503 e demora de resposta após gravação, conforme o contrato do ERP.
10. **Ação na interface:** mostrar situação de envio e botão “Enviar ao ERP”, habilitado
    somente em `READY`, com carregamento e erro. Usar persistência de processamento e
    atualizar a situação ao terminar. Conforme a arquitetura aprovada, o envio usa uma tabela
    própria, separada do registro de eventos recebidos.
11. **Atualização da tela:** manter os dados do envio atualizados durante o processamento.
12. **Testes de idempotência:** cobrir webhook e envio ao ERP, comprovando ausência de duplicatas.
13. **Autenticação:** todos os endpoints desta aplicação exigem `X-Api-Key`, inclusive o webhook.
    O webhook mantém também a verificação HMAC.
14. **Problemas existentes:** corrigir os problemas prioritários e registrar os demais com
    problema, impacto e recomendação. Não é necessário corrigir tudo.

## Requisitos secundários

| Melhoria | Resultado esperado |
|---|---|
| Unificar o cálculo do status da RFQ | Lista e detalhe usam a função existente, sem divergência. |
| Corrigir blacklist | Normalizar também os valores da lista e impedir cotação de peças bloqueadas. |
| Corrigir datas | Preservar o dia de calendário sem efeito de fuso e rejeitar datas inexistentes. |
| Corrigir arredondamento monetário | Usar half-up, evitando diferenças de centavos. |
| Validar payloads | Rejeitar campos ausentes, tipos incorretos e valores inválidos com respostas claras. |
| Validar paginação | Exigir inteiros positivos e limitar o tamanho da página. |
| Paginar a tela | Navegar além dos primeiros vinte RFQs pela API existente. |
| Mensagens e acessibilidade | Erros compreensíveis, feedback de ações e estados identificáveis além da cor. |
| Logs úteis | Registrar `rfqId`, `eventId`, tentativa e resultado, sem segredos. |
| Validar configuração inicial | Detectar chaves e configurações obrigatórias ausentes antes de aceitar requisições. |
| Regressões pequenas | Testar status, datas, blacklist e preços. |

<validacao>
Para cada regra, criar um cenário válido e um cenário inválido/falho com o resultado esperado.
Usar RED → GREEN para comportamento novo e correções; validar concorrência e falhas do ERP.
Revisar cobertura funcional e cobertura medida, documentando limitações verificadas.
</validacao>

<interface>
Após validar a lógica principal, melhorar a pequena interface de operação/teste usando as
cores, os botões e a estética geral de https://aloiaaerospace.com/.
Preservar a estrutura frontend existente e priorizar os requisitos funcionais anteriores.
</interface>

<entrega>
Explicar brevemente a implementação de cada tarefa, apontando arquivos e linhas.
Listar todos os arquivos, tabelas, entidades e endpoints novos para revisão.
Rodar localmente e deixar a feature disponível para teste.
</entrega>

## Decisões complementares aprovadas

- PostgreSQL resolve idempotência e concorrência; não adicionar infraestrutura de fila.
- Uma entrega ao ERP congela a cotação. Cancelamentos posteriores permanecem no histórico local;
  alterar ou cancelar pedidos no ERP está fora do escopo.
- Após resposta incerta, consultar o ERP até localizar o pedido; uma consulta vazia não autoriza
  outro POST. Segurança contra duplicação prevalece sobre recuperação automática nessa situação.
- A especificação viva e os critérios verificáveis estão em `specs/001-aloia-rfq-reliability/spec.md`.
