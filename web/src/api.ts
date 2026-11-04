export interface RfqSummary {
  rfqId: string;
  customerName: string;
  itemCount: number;
  status: string;
  createdAt: string;
}

export interface RfqItem {
  lineNumber: number;
  rawPartNumber: string;
  partNumber: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  requiredBy: string | null;
  status: string;
  invalidReason: string | null;
  warnings: string[];
  unitPriceUsd: string | null;
  totalPriceUsd: string | null;
}

export interface Rfq {
  rfqId: string;
  customerCode: string;
  customerName: string;
  status: string;
  items: RfqItem[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Erro ${res.status}`);
  }
  return res.json();
}

export const api = {
  listRfqs: () => request<RfqSummary[]>('/rfqs'),
  getRfq: (rfqId: string) => request<Rfq>(`/rfqs/${rfqId}`),
  noQuote: (rfqId: string, lineNumber: number) =>
    request(`/rfqs/${rfqId}/items/${lineNumber}/no-quote`, { method: 'POST' }),
};
