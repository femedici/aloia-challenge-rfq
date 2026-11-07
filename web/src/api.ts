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
  cancellationReason: string | null;
  warnings: string[];
  unitPriceUsd: string | null;
  totalPriceUsd: string | null;
}

export interface Submission {
  status: 'not_sent' | 'pending' | 'sending' | 'retry_wait' | 'reconciling' | 'sent' | 'failed';
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  nextAttemptAt: string | null;
  erpOrderId: string | null;
  lastError: string | null;
}

export interface Rfq {
  rfqId: string;
  customerCode: string;
  customerName: string;
  status: string;
  items: RfqItem[];
  submission: Submission;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', ...init?.headers },
  }).catch(() => {
    throw new Error('Não foi possível conectar à API. Verifique a conexão e tente novamente.');
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    throw new ApiError(typeof message === 'string' ? message : `A solicitação falhou (HTTP ${res.status}).`, res.status);
  }
  return res.json();
}

export const api = {
  listRfqs: (page = 1, pageSize = 20) => request<RfqSummary[]>(`/rfqs?page=${page}&pageSize=${pageSize}`),
  getRfq: (rfqId: string) => request<Rfq>(`/rfqs/${encodeURIComponent(rfqId)}`),
  noQuote: (rfqId: string, lineNumber: number) =>
    request(`/rfqs/${encodeURIComponent(rfqId)}/items/${lineNumber}/no-quote`, { method: 'POST' }),
  submitRfq: (rfqId: string) =>
    request<Submission>(`/rfqs/${encodeURIComponent(rfqId)}/submit`, { method: 'POST' }),
};
