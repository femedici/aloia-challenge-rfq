import { useEffect, useReducer, useRef, useState } from 'react';
import { RfqList } from './RfqList';
import { RfqDetail } from './RfqDetail';
import { initialRfqListState, rfqListReducer } from './rfq-list-state';

function currentRfqId() {
  const match = window.location.hash.match(/^#\/rfqs\/(.+)$/);
  try {
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [rfqId, setRfqId] = useState(currentRfqId);
  const [listState, dispatchList] = useReducer(rfqListReducer, initialRfqListState);
  const main = useRef<HTMLElement>(null);
  const previousRfqId = useRef(rfqId);

  useEffect(() => {
    const onChange = () => setRfqId(currentRfqId());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  useEffect(() => {
    if (previousRfqId.current !== rfqId) main.current?.focus();
    previousRfqId.current = rfqId;
  }, [rfqId]);

  return (
    <div className={`app-shell ${rfqId ? 'detail-view' : 'list-view'}`}>
      <a className="skip-link" href="#main-content" onClick={(event) => {
        event.preventDefault();
        main.current?.focus();
      }}>Pular para o conteúdo</a>
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="#/" aria-label="Aloia Aerospace — solicitações de cotação">
            <img src="/aloia-logo.png" alt="Aloia Aerospace Inc" width="333" height="97" />
          </a>
          <div className="workspace-name">CONTROLE RFQ<span>Operações de cotação</span></div>
        </div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1}>
        <nav className="breadcrumb" aria-label="Navegação">
          {rfqId ? <><a href="#/">Solicitações</a><span aria-hidden="true">/</span><span>Detalhe do RFQ</span></> : <span>Operações / Solicitações</span>}
        </nav>
        {rfqId ? <RfqDetail key={rfqId} rfqId={rfqId} /> : <RfqList state={listState} dispatch={dispatchList} />}
      </main>
      <footer className="app-footer">Aloia Aerospace <span>Gestão de RFQs</span></footer>
    </div>
  );
}
