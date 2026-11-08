import { useState } from 'react';
import type { Dispatch, FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { RfqSortField } from './api';
import type { RfqFilters, RfqListAction, RfqListState } from './rfq-list-state';
import { quotationDescriptions, quotationLabels, rfqStatusLabel } from './status-labels';

const pageSize = 20;

function SortHeading({ field, label, state, dispatch, numeric = false }: {
  field: RfqSortField; label: string; state: RfqListState; dispatch: Dispatch<RfqListAction>; numeric?: boolean;
}) {
  const active = state.sortBy === field;
  const ascending = active && state.sortDirection === 'asc';
  return (
    <th scope="col" className={numeric ? 'num' : undefined} aria-sort={active ? ascending ? 'ascending' : 'descending' : 'none'}>
      <button className="sort-button" type="button" onClick={() => dispatch({ type: 'sort', field })}
        aria-label={`${label}: ordenar ${ascending ? 'decrescente' : 'crescente'}`}>
        {label}
        <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true" focusable="false">
          <path className={ascending ? 'sort-selected' : ''} d="M3 7 7 3 11 7" />
          <path className={active && !ascending ? 'sort-selected' : ''} d="m3 13 4 4 4-4" />
        </svg>
      </button>
    </th>
  );
}

export function RfqList({ state, dispatch }: { state: RfqListState; dispatch: Dispatch<RfqListAction> }) {
  const [filters, setFilters] = useState<RfqFilters>({ customer: state.customer, rfq: state.rfq, status: state.status });
  const { page, ...options } = state;
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['rfqs', state], queryFn: () => api.listRfqs(page, pageSize, options),
  });
  const filtered = !!(state.customer || state.rfq || state.status);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    dispatch({ type: 'filter', filters });
  }

  function clearFilters() {
    const empty = { customer: '', rfq: '', status: '' };
    setFilters(empty);
    dispatch({ type: 'filter', filters: empty });
  }

  return (
    <section className="rfq-list" aria-labelledby="rfq-list-title">
      <div className="list-controls">
        <header className="section-header">
          <div>
            <h1 id="rfq-list-title">Solicitações de cotação</h1>
            <p className="section-description">Acompanhe a cotação e a confirmação de envio ao ERP.</p>
          </div>
          <button className="secondary" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? 'Atualizando…' : 'Atualizar lista'}
          </button>
        </header>
        <form className="list-filters" aria-label="Filtros das solicitações" onSubmit={applyFilters}>
          <label htmlFor="customer-filter">Cliente
            <input id="customer-filter" value={filters.customer} placeholder="Nome ou código do cliente"
              onChange={(event) => setFilters({ ...filters, customer: event.target.value })} />
          </label>
          <label htmlFor="rfq-filter">RFQ
            <input id="rfq-filter" value={filters.rfq} placeholder="Número ou parte do RFQ"
              onChange={(event) => setFilters({ ...filters, rfq: event.target.value })} />
          </label>
          <label htmlFor="status-filter">Situação da cotação
            <select id="status-filter" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Todas as situações</option>
              {Object.entries(quotationLabels).map(([status, label]) => <option key={status} value={status}>{status === 'READY' ? 'Pronta ou enviada ao ERP' : label}</option>)}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit">Aplicar</button>
            <button type="button" className="secondary" onClick={clearFilters}>Limpar</button>
          </div>
        </form>
        <details className="status-guide">
          <summary>Entenda as situações da cotação e do ERP</summary>
          <dl>{Object.entries(quotationDescriptions).map(([status, description]) => (
            <div key={status}><dt>{quotationLabels[status]} ({status})</dt><dd>{description}</dd></div>
          ))}</dl>
          <p>Pronta para envio ainda não confirma recebimento. A coluna Cotação mostra o andamento do envio e, após confirmação, Cotação enviada ao ERP. O filtro Pronta ou enviada ao ERP reúne as cotações prontas, inclusive quando o envio já começou ou terminou. Cancelado é um estado do item.</p>
        </details>
        {error && <p className="error" role="alert">Não foi possível carregar a lista. {error.message}</p>}
      </div>
      <div className="table-region list-table-region" role="region" aria-label="Solicitações de cotação — tabela com rolagem" tabIndex={0} aria-busy={isFetching}>
        <table>
          <caption className="sr-only">Solicitações de cotação — página {page}</caption>
          <thead><tr>
            <SortHeading field="rfqId" label="RFQ" state={state} dispatch={dispatch} />
            <SortHeading field="customerName" label="Cliente" state={state} dispatch={dispatch} />
            <SortHeading field="itemCount" label="Itens" state={state} dispatch={dispatch} numeric />
            <SortHeading field="status" label="Cotação" state={state} dispatch={dispatch} />
            <th scope="col" className="action-column">Ações</th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="table-empty" role="status">Carregando solicitações…</td></tr>}
            {!isLoading && !error && data?.length === 0 && <tr><td colSpan={5} className="table-empty">
              <div role="status"><h2>{filtered ? 'Nenhum RFQ corresponde aos filtros' : page === 1 ? 'Nenhuma solicitação recebida' : 'Você chegou ao fim da lista'}</h2>
                <p>{filtered ? 'Ajuste os filtros ou limpe a busca para consultar todas as solicitações.' : page === 1 ? 'Os RFQs aparecerão aqui assim que forem recebidos.' : 'Use Anterior para continuar consultando os RFQs.'}</p></div>
              {filtered && <button className="secondary" onClick={clearFilters}>Limpar filtros</button>}
            </td></tr>}
            {data?.map((rfq) => (
              <tr key={rfq.rfqId}>
                <th scope="row" className="rfq-id">{rfq.rfqId}</th>
                <td>{rfq.customerName}</td>
                <td className="num">{rfq.itemCount}</td>
                <td><span className={`badge ${rfq.submissionStatus === 'not_sent' ? rfq.status : rfq.submissionStatus}`} title={`Situação da cotação: ${quotationLabels[rfq.status] ?? rfq.status}`}>{rfqStatusLabel(rfq.status, rfq.submissionStatus)}</span></td>
                <td className="action-column"><a className="eye-action" href={`#/rfqs/${encodeURIComponent(rfq.rfqId)}`}
                  aria-label={`Visualizar RFQ ${rfq.rfqId}`} title={`Visualizar RFQ ${rfq.rfqId}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                </a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="pagination" aria-label="Paginação das solicitações">
        <p role="status">Página <strong>{page}</strong>{data && data.length > 0 && ` · ${data.length} solicitações`}</p>
        <div className="pagination-actions">
          <button className="secondary" disabled={page === 1 || isLoading} onClick={() => dispatch({ type: 'page', page: page - 1 })}>Anterior</button>
          <button className="secondary" disabled={isLoading || !!error || !data || data.length < pageSize} onClick={() => dispatch({ type: 'page', page: page + 1 })}>Próxima</button>
        </div>
      </nav>
    </section>
  );
}
