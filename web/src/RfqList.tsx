import { useQuery } from '@tanstack/react-query';
import { api } from './api';

const pageSize = 20;

export function RfqList({ page, onPageChange }: { page: number; onPageChange: (page: number) => void }) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['rfqs', page], queryFn: () => api.listRfqs(page, pageSize),
  });

  return (
    <section aria-labelledby="rfq-list-title">
      <header className="section-header">
        <div>
          <p className="eyebrow">RFQ Management</p>
          <h1 id="rfq-list-title">Solicitações de cotação</h1>
          <p className="section-description">Acompanhe os itens e prepare suas cotações para envio ao ERP.</p>
        </div>
        <button className="secondary" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? 'Atualizando…' : 'Atualizar lista'}
        </button>
      </header>
      {error && <p className="error" role="alert">Não foi possível carregar a lista. {error.message}</p>}
      {isLoading && <p className="empty-state" role="status">Carregando solicitações…</p>}
      {!isLoading && !error && data?.length === 0 && (
        <div className="empty-state" role="status">
          <h2>{page === 1 ? 'Nenhuma solicitação recebida' : 'Você chegou ao fim da lista'}</h2>
          <p>{page === 1 ? 'Os RFQs aparecerão aqui assim que forem recebidos.' : 'Volte à página anterior para continuar consultando os RFQs.'}</p>
        </div>
      )}
      {!!data?.length && <div className="table-region" role="region" aria-label="Solicitações de cotação" tabIndex={0}>
      <table>
        <caption className="sr-only">Solicitações de cotação — página {page}</caption>
      <thead>
        <tr>
          <th scope="col">RFQ</th>
          <th scope="col">Cliente</th>
          <th scope="col" className="num">Itens</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {data.map((rfq) => (
          <tr key={rfq.rfqId}>
            <th scope="row"><a className="rfq-link" href={`#/rfqs/${encodeURIComponent(rfq.rfqId)}`}>{rfq.rfqId}</a></th>
            <td>{rfq.customerName}</td>
            <td className="num">{rfq.itemCount}</td>
            <td>
              <span className={`badge ${rfq.status}`}>{rfq.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
      </table>
      </div>}
      <nav className="pagination" aria-label="Paginação das solicitações">
        <p role="status">Página <strong>{page}</strong>{data && data.length > 0 && ` · ${data.length} solicitações`}</p>
        <div className="pagination-actions">
          <button className="secondary" disabled={page === 1 || isLoading} onClick={() => onPageChange(page - 1)}>Anterior</button>
          <button className="secondary" disabled={isLoading || !!error || !data || data.length < pageSize} onClick={() => onPageChange(page + 1)}>Próxima</button>
        </div>
      </nav>
    </section>
  );
}
