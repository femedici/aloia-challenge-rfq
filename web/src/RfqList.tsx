import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export function RfqList() {
  const { data, isLoading, error } = useQuery({ queryKey: ['rfqs'], queryFn: api.listRfqs });

  if (isLoading) return <p>Carregando…</p>;
  if (error) return <p className="error">{error.message}</p>;
  if (!data?.length) return <p>Nenhum RFQ recebido ainda. Rode <code>npm run webhooks -- basico</code>.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>RFQ</th>
          <th>Cliente</th>
          <th>Itens</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {data.map((rfq) => (
          <tr key={rfq.rfqId}>
            <td>
              <a href={`#/rfqs/${rfq.rfqId}`}>{rfq.rfqId}</a>
            </td>
            <td>{rfq.customerName}</td>
            <td>{rfq.itemCount}</td>
            <td>
              <span className={`badge ${rfq.status}`}>{rfq.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
