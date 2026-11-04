import { useEffect, useState } from 'react';
import { RfqList } from './RfqList';
import { RfqDetail } from './RfqDetail';

function currentRfqId() {
  const match = window.location.hash.match(/^#\/rfqs\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function App() {
  const [rfqId, setRfqId] = useState(currentRfqId);

  useEffect(() => {
    const onChange = () => setRfqId(currentRfqId());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <main>
      <h1>
        <a href="#/">RFQs</a>
      </h1>
      {rfqId ? <RfqDetail rfqId={rfqId} /> : <RfqList />}
    </main>
  );
}
