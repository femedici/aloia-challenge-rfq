import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export function RfqDetail({ rfqId }: { rfqId: string }) {
  const queryClient = useQueryClient();
  const { data: rfq, isLoading, error } = useQuery({
    queryKey: ['rfq', rfqId],
    queryFn: () => api.getRfq(rfqId),
  });

  const noQuote = useMutation({
    mutationFn: (lineNumber: number) => api.noQuote(rfqId, lineNumber),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rfq', rfqId] }),
  });

  if (isLoading) return <p>Carregando…</p>;
  if (error) return <p className="error">{error.message}</p>;
  if (!rfq) return null;

  return (
    <section>
      <header className="rfq-header">
        <h2>{rfq.rfqId}</h2>
        <span className={`badge ${rfq.status}`}>{rfq.status}</span>
        <span className="muted">
          {rfq.customerName} ({rfq.customerCode})
        </span>
      </header>

      {noQuote.error && <p className="error">{noQuote.error.message}</p>}

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Part number</th>
            <th>Descrição</th>
            <th>Qtd</th>
            <th>Necessidade</th>
            <th>Status</th>
            <th>Avisos</th>
            <th className="num">Preço unit. (USD)</th>
            <th className="num">Total (USD)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rfq.items.map((item) => (
            <tr key={item.lineNumber}>
              <td>{item.lineNumber}</td>
              <td>
                {item.partNumber ?? '—'}
                <div className="muted">{item.rawPartNumber}</div>
              </td>
              <td>{item.description}</td>
              <td>
                {item.quantity} {item.unit}
              </td>
              <td>{item.requiredBy ?? '—'}</td>
              <td>
                <span className={`badge ${item.status}`}>{item.status}</span>
                {item.invalidReason && <div className="muted">{item.invalidReason}</div>}
              </td>
              <td className="muted">{item.warnings.join(', ')}</td>
              <td className="num">{item.unitPriceUsd ?? '—'}</td>
              <td className="num">{item.totalPriceUsd ?? '—'}</td>
              <td>
                {(item.status === 'pending' || item.status === 'quoted') && (
                  <button disabled={noQuote.isPending} onClick={() => noQuote.mutate(item.lineNumber)}>
                    Não cotar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
