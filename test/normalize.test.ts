import { normalizePartNumber, isValidPartNumber } from '../src/common/normalize';

describe('normalizePartNumber', () => {
  it('remove espaços, hífens e barras e converte para maiúsculas', () => {
    expect(normalizePartNumber(' ab-2231/04 ')).toBe('AB223104');
  });

  it('remove pontos', () => {
    expect(normalizePartNumber('MS 2047.0')).toBe('MS20470');
  });
});

describe('isValidPartNumber', () => {
  it('recusa part number curto', () => {
    expect(isValidPartNumber('X1')).toBe(false);
  });
});
