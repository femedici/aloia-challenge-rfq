import { useEffect, useRef, useState } from 'react';
import { RfqList } from './RfqList';
import { RfqDetail } from './RfqDetail';

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
  const [page, setPage] = useState(1);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const onChange = () => setRfqId(currentRfqId());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={(event) => {
        event.preventDefault();
        main.current?.focus();
      }}>Pular para o conteúdo</a>
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="#/" aria-label="Aloia Aerospace — solicitações de cotação">
            ALOIA<span>AEROSPACE</span>
          </a>
          <div className="workspace-name">Central de cotações<span>Operações</span></div>
        </div>
      </header>
      <main id="main-content" ref={main} tabIndex={-1}>
        <nav className="breadcrumb" aria-label="Navegação">
          {rfqId ? <><a href="#/">Solicitações</a><span aria-hidden="true">/</span><span>Detalhe do RFQ</span></> : <span>Operações / Solicitações</span>}
        </nav>
        {rfqId ? <RfqDetail key={rfqId} rfqId={rfqId} /> : <RfqList page={page} onPageChange={setPage} />}
      </main>
      <footer className="app-footer">Aloia Aerospace <span>Gestão de RFQs</span></footer>
    </>
  );
}
