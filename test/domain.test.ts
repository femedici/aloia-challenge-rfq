import { BadRequestException } from '@nestjs/common';
import { calculateQuote } from '../src/common/price';
import { validatePagination, validateQuoteInput, validateWebhookEvent } from '../src/common/validation';
import type { QuoteInput, RfqCanceledEvent, RfqCreatedEvent } from '../src/rfq/rfq.types';

const quote: QuoteInput = {
  supplier: 'Acme', currency: 'USD', unitCost: '1.005', moq: 1, marginPercent: '0',
};

const created: RfqCreatedEvent = {
  eventId: 'event-created', type: 'rfq.created', occurredAt: '2026-11-02T13:05:12Z',
  data: {
    rfqId: 'RFQ-1', customer: { code: 'C-1', name: 'Customer' },
    items: [{ lineNumber: 1, partNumber: ' ab-123 ', quantity: 3, unit: 'each' }],
  },
};

const canceled: RfqCanceledEvent = {
  eventId: 'event-canceled', type: 'rfq.item_canceled', occurredAt: '2026-11-02T13:05:12Z',
  data: { rfqId: 'RFQ-1', lineNumber: 1, reason: 'Customer canceled' },
};

function expectBadRequest(action: () => unknown, field: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as Error).message).toContain(field);
    return;
  }
  throw new Error(`Expected HTTP 400 for ${field}`);
}

describe('calculateQuote', () => {
  it('arredonda metade para cima no final, inclusive 1.005', () => {
    expect(calculateQuote(1, quote)).toEqual({ unitPriceUsd: '1.01', totalPriceUsd: '1.01' });
  });

  it('segue o exemplo do SPEC com MOQ, custos, margem e câmbio', () => {
    expect(calculateQuote(3, {
      ...quote, currency: 'EUR', unitCost: '10.10', moq: 5,
      freight: '25.00', customs: '7.35', marginPercent: '18.5',
    })).toEqual({ unitPriceUsd: '35.51', totalPriceUsd: '106.53' });
  });

  it('multiplica o preço unitário já arredondado para obter o total', () => {
    expect(calculateQuote(3, { ...quote, unitCost: '0.01', freight: '0.01' }))
      .toEqual({ unitPriceUsd: '0.01', totalPriceUsd: '0.03' });
  });

  it('não arredonda valores intermediários ou casas decimais subcentavo', () => {
    expect(calculateQuote(1, { ...quote, unitCost: '1.00499999999999999999999' }))
      .toEqual({ unitPriceUsd: '1.00', totalPriceUsd: '1.00' });
    expect(calculateQuote(1, { ...quote, unitCost: '0.004', freight: '0.001' }))
      .toEqual({ unitPriceUsd: '0.01', totalPriceUsd: '0.01' });
  });

  it('mantém precisão para custos acima do limite inteiro do Number', () => {
    expect(calculateQuote(2, { ...quote, unitCost: '9007199254740993.005' }))
      .toEqual({ unitPriceUsd: '9007199254740993.01', totalPriceUsd: '18014398509481986.02' });
  });

  it('inclui todas as taxas e usa a quantidade solicitada quando ela excede o MOQ', () => {
    expect(calculateQuote(4, {
      ...quote, currency: 'BRL', unitCost: '10', moq: 0, freight: '1',
      otherCharges: '2', customs: '3', marginPercent: '100',
    })).toEqual({ unitPriceUsd: '4.26', totalPriceUsd: '17.04' });
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'recusa quantidade inválida para cálculo %s', (quantity) => {
      expectBadRequest(() => calculateQuote(quantity, quote), 'quantity');
    },
  );

  it('recusa cotação inválida antes de calcular', () => {
    expectBadRequest(() => calculateQuote(1, { ...quote, unitCost: 'NaN' }), 'unitCost');
  });
});

describe('validateQuoteInput', () => {
  it('aceita valores válidos sem alterar os dados originais', () => {
    const value = { ...quote, supplier: ' Acme ', unitCost: '0001.005', freight: '0.00', marginPercent: '300.000' };
    const original = structuredClone(value);
    expect(() => validateQuoteInput(value)).not.toThrow();
    expect(value).toEqual(original);
  });

  it.each([null, undefined, [], 'quote'])('recusa um corpo que não seja objeto: %s', (value) => {
    expectBadRequest(() => validateQuoteInput(value), 'quote');
  });

  it.each([
    ['supplier', undefined], ['supplier', ' '], ['supplier', 10], ['supplier', 'bad\0value'],
    ['currency', undefined], ['currency', ''], ['currency', 'XYZ'], ['currency', 'usd'],
    ['currency', '_comment'], ['currency', 'toString'], ['currency', '__proto__'],
    ['unitCost', undefined], ['unitCost', 1], ['unitCost', ''], ['unitCost', ' '],
    ['unitCost', '0'], ['unitCost', '-1'], ['unitCost', 'NaN'], ['unitCost', 'Infinity'],
    ['unitCost', '1e3'], ['unitCost', '0x10'], ['unitCost', '1,00'], ['unitCost', '9'.repeat(65)],
    ['moq', undefined], ['moq', -1], ['moq', 1.5], ['moq', '1'], ['moq', Infinity], ['moq', 2147483648],
    ['freight', '-1'], ['freight', ''], ['freight', null], ['otherCharges', 3], ['customs', 'NaN'],
    ['marginPercent', undefined], ['marginPercent', 5], ['marginPercent', '-0.1'],
    ['marginPercent', '300.0000000000000000001'], ['marginPercent', '301'],
  ])('recusa %s inválido (%s)', (field, value) => {
    expectBadRequest(() => validateQuoteInput({ ...quote, [field as string]: value }), field as string);
  });

  it('não inclui o conteúdo recebido na mensagem de erro', () => {
    try {
      validateQuoteInput({ ...quote, currency: 'secret-token-value' });
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).not.toContain('secret-token-value');
    }
  });
});

describe('validateWebhookEvent', () => {
  it.each([created, canceled])('aceita $type sem alterar o payload', (value) => {
    const original = structuredClone(value);
    expect(() => validateWebhookEvent(value)).not.toThrow();
    expect(value).toEqual(original);
  });

  it('preserva valores de domínio inválidos e datas que gerarão warnings', () => {
    const value = structuredClone(created);
    value.data.items = [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((quantity, index) => ({
      lineNumber: index + 1, partNumber: '', quantity, unit: '', requiredBy: '2026-02-31',
    }));
    expect(() => validateWebhookEvent(value)).not.toThrow();
  });

  it.each(['2026-11-02T13:05:12.123Z', '2026-11-02T10:05:12-03:00'])('aceita o timestamp %s', (occurredAt) => {
    expect(() => validateWebhookEvent({ ...created, occurredAt })).not.toThrow();
  });

  it.each([null, undefined, [], 1])('recusa evento que não seja objeto: %s', (value) => {
    expectBadRequest(() => validateWebhookEvent(value), 'event');
  });

  it.each([
    ['eventId', undefined], ['eventId', ' '], ['eventId', 12], ['eventId', 'bad\0id'],
    ['type', undefined], ['type', 'rfq.updated'], ['occurredAt', undefined],
    ['occurredAt', '2026-02-31T13:05:12Z'], ['occurredAt', '2026-11-02'],
    ['occurredAt', '2026-11-02T24:00:00Z'], ['occurredAt', '2026-11-02T13:05:12'],
    ['data', undefined], ['data', []],
  ])('recusa %s inválido (%s)', (field, value) => {
    expectBadRequest(() => validateWebhookEvent({ ...created, [field as string]: value }), field as string);
  });

  it.each([
    ['rfqId', ''], ['rfqId', undefined], ['customer', undefined], ['customer', []],
    ['customer', { code: 'C-1' }], ['customer', { code: '', name: 'Name' }],
    ['items', undefined], ['items', {}], ['items', []], ['items', [null]],
  ])('recusa data.%s inválido', (field, value) => {
    expectBadRequest(() => validateWebhookEvent({ ...created, data: { ...created.data, [field as string]: value } }), field as string);
  });

  it.each([
    ['lineNumber', 0], ['lineNumber', 1.5], ['lineNumber', 2147483648], ['lineNumber', '1'],
    ['partNumber', null], ['partNumber', 123], ['unit', undefined], ['unit', {}],
    ['quantity', undefined], ['quantity', '1'], ['quantity', NaN], ['quantity', Infinity],
    ['description', false], ['requiredBy', 20261101],
  ])('recusa items[0].%s malformado', (field, value) => {
    const event = structuredClone(created);
    event.data.items[0][field as string] = value;
    expectBadRequest(() => validateWebhookEvent(event), field as string);
  });

  it('recusa números de linha duplicados', () => {
    const event = structuredClone(created);
    event.data.items.push({ ...event.data.items[0] });
    expectBadRequest(() => validateWebhookEvent(event), 'lineNumber');
  });

  it.each([['lineNumber', 0], ['lineNumber', undefined], ['reason', ' '], ['reason', 1], ['reason', undefined]])(
    'recusa cancelamento com %s inválido', (field, value) => {
      expectBadRequest(() => validateWebhookEvent({ ...canceled, data: { ...canceled.data, [field as string]: value } }), field as string);
    },
  );
});

describe('validatePagination', () => {
  it.each([[1, 20], [2, 100], [Number.MAX_SAFE_INTEGER, 1]])('aceita página %s e tamanho %s', (page, pageSize) => {
    expect(() => validatePagination(page, pageSize)).not.toThrow();
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', undefined])(
    'recusa página %s', (page) => expectBadRequest(() => validatePagination(page, 20), 'page'),
  );

  it.each([0, -1, 1.5, NaN, Infinity, 101, '20', undefined])(
    'recusa tamanho %s', (pageSize) => expectBadRequest(() => validatePagination(1, pageSize), 'pageSize'),
  );

  it('recusa offset que ultrapassa o limite seguro de inteiros', () => {
    expectBadRequest(() => validatePagination(Number.MAX_SAFE_INTEGER, 100), 'page');
  });
});
