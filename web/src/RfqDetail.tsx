import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { Rfq, Submission } from './api';

const activeStatuses: Submission['status'][] = ['pending', 'sending', 'retry_wait', 'reconciling'];
const submissionLabels: Record<Submission['status'], string> = {
  not_sent: 'Não enviado', pending: 'Aguardando envio', sending: 'Enviando ao ERP',
  retry_wait: 'Nova tentativa agendada', reconciling: 'Confirmando recebimento',
  sent: 'Enviado com sucesso', failed: 'Falha definitiva',
};
const submissionDescriptions: Record<Submission['status'], string> = {
  not_sent: 'Somente os itens cotados serão enviados. O RFQ precisa estar READY.',
  pending: 'A cotação foi registrada e está aguardando processamento.',
  sending: 'A cotação está sendo transmitida. A situação será atualizada automaticamente.',
  retry_wait: 'O ERP está temporariamente indisponível. Uma nova tentativa será feita automaticamente.',
  reconciling: 'Consultando o ERP para confirmar se o pedido já foi recebido.',
  sent: 'O pedido foi confirmado pelo ERP. Consulte o identificador abaixo.',
  failed: 'O envio foi encerrado. Consulte o motivo para orientar a correção.',
};
const itemLabels: Record<string, string> = {
  pending: 'Pendente', quoted: 'Cotado', no_quote: 'Não cotar', canceled: 'Cancelado', invalid: 'Inválido',
};
const reasonLabels: Record<string, string> = {
  invalid_part_number: 'Part number inválido', invalid_quantity: 'Quantidade inválida',
  invalid_unit: 'Unidade inválida', invalid_required_by: 'Data de necessidade inválida',
};
const formatTimestamp = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function RfqDetail({ rfqId }: { rfqId: string }) {
  const queryClient = useQueryClient();
  const [checkingSubmission, setCheckingSubmission] = useState(false);
  const { data: rfq, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['rfq', rfqId],
    queryFn: () => api.getRfq(rfqId),
    refetchInterval: (query) => checkingSubmission || activeStatuses.includes(query.state.data?.submission.status ?? 'not_sent') ? 2000 : false,
  });

  useEffect(() => {
    if (rfq && rfq.submission.status !== 'not_sent') setCheckingSubmission(false);
  }, [rfq]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['rfq', rfqId] }),
    queryClient.invalidateQueries({ queryKey: ['rfqs'] }),
  ]);

  const noQuote = useMutation({
    mutationFn: (lineNumber: number) => api.noQuote(rfqId, lineNumber),
    onSettled: refresh,
  });

  const submit = useMutation({
    mutationFn: () => api.submitRfq(rfqId),
    onMutate: async () => {
      setCheckingSubmission(true);
      await queryClient.cancelQueries({ queryKey: ['rfq', rfqId] });
    },
    onSuccess: (submission) => {
      queryClient.setQueryData<Rfq>(['rfq', rfqId], (current) => current ? { ...current, submission } : current);
      setCheckingSubmission(false);
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) {
        setCheckingSubmission(false);
      }
    },
    onSettled: refresh,
  });

  if (isLoading) return <p className="empty-state" role="status">Carregando RFQ…</p>;
  if (error && !rfq) return <section className="empty-state"><h1>Não foi possível carregar o RFQ</h1><p className="error" role="alert">{error.message}</p><button onClick={() => void refetch()} disabled={isFetching}>Tentar novamente</button></section>;
  if (!rfq) return null;
  const submission = rfq.submission;
  const hasSubmission = submission.status !== 'not_sent';
  const itemsLocked = hasSubmission || submit.isPending || checkingSubmission;
  const canSubmit = rfq.status === 'READY' && !hasSubmission && !submit.isPending && !noQuote.isPending;
  const active = activeStatuses.includes(submission.status);

  return (
    <section aria-labelledby="rfq-title">
      <header className="rfq-header">
        <div>
          <p className="eyebrow">Solicitação de cotação</p>
          <h1 id="rfq-title">{rfq.rfqId}</h1>
          <p className="section-description">{rfq.customerName} <span className="customer-code">{rfq.customerCode}</span></p>
        </div>
        <span className={`badge ${rfq.status}`}>{rfq.status}</span>
      </header>

      {error && <p className="error" role="alert">Não foi possível atualizar o RFQ. {error.message}</p>}
      <section className={`submission-panel submission-${submission.status}`} aria-labelledby="submission-title">
        <div className="submission-heading">
          <div>
            <p className="eyebrow">Integração</p>
            <h2 id="submission-title">Envio ao ERP</h2>
          </div>
          <div className="submission-actions">
            <button className="secondary" disabled={isFetching} onClick={() => void refetch()}>Consultar situação</button>
            {!hasSubmission && <button disabled={!canSubmit} onClick={() => submit.mutate()} aria-describedby="submission-description">
              {submit.isPending ? 'Solicitando envio…' : checkingSubmission ? 'Tentar envio novamente' : 'Enviar ao ERP'}
            </button>}
          </div>
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          <span className={`badge delivery ${submission.status}`}>{submissionLabels[submission.status]}</span>
          <p id="submission-description" className="submission-description">{submissionDescriptions[submission.status]}</p>
        </div>
        {checkingSubmission && !submit.isPending && !hasSubmission && (
          <p className="notice" role="status">Não foi possível confirmar a solicitação. A situação está sendo consultada automaticamente. Se necessário, tente enviar novamente. As alterações nos itens aguardam a confirmação.</p>
        )}
        {submit.error && !hasSubmission && <p className="error" role="alert">Não foi possível confirmar o envio. {submit.error.message}</p>}
        {hasSubmission && <>
          <dl className="submission-facts">
            <div><dt>Tentativas</dt><dd>{submission.attempts}</dd></div>
            {submission.startedAt && <div><dt>Iniciado em</dt><dd><time dateTime={submission.startedAt}>{formatTimestamp(submission.startedAt)}</time></dd></div>}
            {submission.nextAttemptAt && <div><dt>{submission.status === 'reconciling' ? 'Próxima consulta' : 'Próxima tentativa'}</dt><dd><time dateTime={submission.nextAttemptAt}>{formatTimestamp(submission.nextAttemptAt)}</time></dd></div>}
            {submission.completedAt && <div><dt>Concluído em</dt><dd><time dateTime={submission.completedAt}>{formatTimestamp(submission.completedAt)}</time></dd></div>}
            {submission.erpOrderId && <div><dt>Pedido no ERP</dt><dd className="order-id">{submission.erpOrderId}</dd></div>}
          </dl>
          {submission.lastError && <p className={submission.status === 'failed' ? 'error' : 'notice'} role={submission.status === 'failed' ? 'alert' : undefined}><strong>{submission.status === 'failed' ? 'Motivo: ' : 'Última ocorrência: '}</strong>{submission.lastError}</p>}
          <p className="muted">Os itens enviados foram preservados. A cotação está bloqueada para alterações.</p>
        </>}
        {active && <p className="auto-refresh">Atualização automática a cada 2 segundos.</p>}
      </section>

      <div className="items-heading"><h2>Itens da solicitação <span className="item-count">{rfq.items.length}</span></h2><p className="muted">Preços em USD</p></div>
      {noQuote.error && <p className="error" role="alert">Não foi possível alterar o item. {noQuote.error.message}</p>}
      {noQuote.isSuccess && <p className="success" role="status">Item {noQuote.variables} marcado como não cotar.</p>}

      <div className="table-region" role="region" aria-label={`Itens do RFQ ${rfq.rfqId}`} tabIndex={0}>
      <table>
        <caption className="sr-only">Itens, situação e preços da solicitação {rfq.rfqId}</caption>
        <thead>
          <tr>
            <th scope="col">Linha</th>
            <th scope="col">Part number</th>
            <th scope="col">Descrição</th>
            <th scope="col" className="num">Qtd.</th>
            <th scope="col">Necessidade</th>
            <th scope="col">Status</th>
            <th scope="col">Avisos</th>
            <th scope="col" className="num">Unitário</th>
            <th scope="col" className="num">Total</th>
            <th scope="col"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {rfq.items.map((item) => (
            <tr key={item.lineNumber}>
              <th scope="row" className="line-number">{item.lineNumber}</th>
              <td>
                {item.partNumber ?? '—'}
                <div className="muted">{item.rawPartNumber}</div>
              </td>
              <td>{item.description ?? '—'}</td>
              <td className="num nowrap">
                {item.quantity} {item.unit}
              </td>
              <td className="nowrap">{item.requiredBy ?? '—'}</td>
              <td>
                <span className={`badge ${item.status}`}>{itemLabels[item.status] ?? item.status}</span>
                {item.invalidReason && <div className="muted">{reasonLabels[item.invalidReason] ?? item.invalidReason}</div>}
                {item.cancellationReason && <div className="muted">{item.cancellationReason}</div>}
              </td>
              <td className="muted">{item.warnings.length ? item.warnings.map((warning) => warning.startsWith('possible_duplicate:') ? `Possível duplicata da linha ${warning.split(':')[1]}` : reasonLabels[warning] ?? warning).join('; ') : '—'}</td>
              <td className="num">{item.unitPriceUsd ?? '—'}</td>
              <td className="num">{item.totalPriceUsd ?? '—'}</td>
              <td>
                {(item.status === 'pending' || item.status === 'quoted') && (
                  <button className="secondary compact" disabled={noQuote.isPending || itemsLocked} onClick={() => noQuote.mutate(item.lineNumber)} aria-label={`Não cotar item ${item.lineNumber}`}>
                    {noQuote.isPending && noQuote.variables === item.lineNumber ? 'Salvando…' : 'Não cotar'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
