import { rfqStatusLabel } from '../web/src/status-labels';
import { api } from '../web/src/api';
import { initialRfqListState, rfqListReducer } from '../web/src/rfq-list-state';

describe('RFQ list API requests', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('sends filters and sorting to the API together with pagination', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetch;
    await api.listRfqs(3, 20, {
      customer: 'A&B / C-0042', rfq: 'RFQ #20', status: 'READY',
      sortBy: 'submissionStatus', sortDirection: 'asc',
    });
    const url = new URL(fetch.mock.calls[0][0], 'http://localhost');
    expect(url.pathname).toBe('/api/rfqs');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '3', pageSize: '20', customer: 'A&B / C-0042', rfq: 'RFQ #20',
      status: 'READY', sortBy: 'submissionStatus', sortDirection: 'asc',
    });
  });
});

describe('RFQ list navigation state', () => {
  it('applies global filters from page 3 and starts at page 1 without losing the chosen ordering', () => {
    const result = rfqListReducer({ ...initialRfqListState, page: 3, sortBy: 'itemCount', sortDirection: 'asc' }, {
      type: 'filter', filters: { customer: '  Skyline  ', rfq: ' RFQ-10 ', status: 'READY' },
    });
    expect(result).toEqual({ page: 1, customer: 'Skyline', rfq: 'RFQ-10', status: 'READY', sortBy: 'itemCount', sortDirection: 'asc' });
  });

  it('toggles ordering in both directions and resets pagination while retaining filters', () => {
    const first = rfqListReducer({ ...initialRfqListState, page: 3, customer: 'Skyline', status: 'READY' }, { type: 'sort', field: 'submissionStatus' });
    expect(first).toMatchObject({ page: 1, customer: 'Skyline', status: 'READY', sortBy: 'submissionStatus', sortDirection: 'asc' });
    const second = rfqListReducer({ ...first, page: 2 }, { type: 'sort', field: 'submissionStatus' });
    expect(second).toMatchObject({ page: 1, customer: 'Skyline', status: 'READY', sortBy: 'submissionStatus', sortDirection: 'desc' });
  });

  it('changes pages without discarding the current filters or order', () => {
    const state = { ...initialRfqListState, rfq: 'RFQ-10', status: 'READY' };
    expect(rfqListReducer(state, { type: 'page', page: 2 })).toEqual({ ...state, page: 2 });
  });

  it('clears combined filters and returns to the first page', () => {
    const result = rfqListReducer({ ...initialRfqListState, page: 5, customer: 'Skyline', rfq: 'RFQ-10', status: 'CLOSED' }, {
      type: 'filter', filters: { customer: '', rfq: '', status: '' },
    });
    expect(result).toEqual(initialRfqListState);
  });
});

describe('quotation display after ERP delivery', () => {
  it('distinguishes a ready quotation from a confirmed ERP order', () => {
    expect(rfqStatusLabel('READY', 'not_sent')).toBe('Pronta para envio');
    expect(rfqStatusLabel('READY', 'sent')).toBe('Cotação enviada ao ERP');
  });

  it.each(['pending', 'sending', 'retry_wait', 'reconciling', 'failed'] as const)(
    'does not hide %s delivery behind the ready quotation label', (delivery) => {
      const label = rfqStatusLabel('READY', delivery);
      expect(label).not.toBe('Pronta para envio');
      expect(label).not.toBe('Cotação enviada ao ERP');
      expect(label.length).toBeGreaterThan(0);
    },
  );

  it('preserves confirmation after a late item cancellation closes the quotation', () => {
    expect(rfqStatusLabel('CLOSED', 'sent')).toBe('Cotação enviada ao ERP');
    expect(rfqStatusLabel('CLOSED', 'not_sent')).toBe('Encerrada — sem cotação');
    expect(rfqStatusLabel('OPEN', 'not_sent')).toBe('Aberta — sem cotação');
  });
});
