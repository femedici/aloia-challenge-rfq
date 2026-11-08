import { execFileSync } from 'node:child_process';
import { normalizePartNumber, isValidPartNumber, isBlacklisted, normalizeUnit, parseRequiredBy } from '../src/common/normalize';

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

  it.each(['ABC123', 'XYZ'])('aceita o part number normalizado %s', (partNumber) => {
    expect(isValidPartNumber(partNumber)).toBe(true);
  });

  it.each(['', 'AB@123', 'ábc', 'ab123'])('recusa o part number inválido %s', (partNumber) => {
    expect(isValidPartNumber(partNumber)).toBe(false);
  });
});

describe('normalizeUnit', () => {
  it.each([[' each ', 'EA'], ['pcs', 'PC'], ['feet', 'FT'], ['kit', 'KT'], ['box', null]])(
    'normaliza %s para %s', (raw, expected) => {
      expect(normalizeUnit(raw)).toBe(expected);
    },
  );
});

describe('isBlacklisted', () => {
  it.each(['ZX900001', 'QK447188', 'AV77123', ' qk-4471/88 '])(
    'normaliza os dois lados antes de comparar %s', (partNumber) => {
      expect(isBlacklisted(partNumber)).toBe(true);
    },
  );

  it('não bloqueia outras peças', () => {
    expect(isBlacklisted('AB223104')).toBe(false);
  });
});

describe('parseRequiredBy', () => {
  it.each([
    ['2026-11-20', '2026-11-20'], ['11/28/2026', '2026-11-28'],
    ['2024-02-29', '2024-02-29'], ['02/29/2000', '2000-02-29'], ['0001-01-01', '0001-01-01'],
  ])('interpreta %s como data de calendário', (raw, expected) => {
    expect(parseRequiredBy(raw)).toBe(expected);
  });

  it.each(['2026-02-31', '2026-02-29', '02/29/1900', '2026-04-31', '2026-13-01',
    '2026-00-01', '2026-11-00', '0000-01-01', '14-Nov-26', '25/11/2026', '2026-1-01',
    '2026-11-20T00:00:00Z', ''])('recusa a data inexistente ou o formato %s', (raw) => {
    expect(parseRequiredBy(raw)).toBeNull();
  });

  it.each(['America/Los_Angeles', 'Pacific/Kiritimati'])('preserva o dia no fuso %s', (timezone) => {
    const output = execFileSync(process.execPath, ['-r', 'ts-node/register', '-e',
      "process.stdout.write(JSON.stringify(['2026-11-20', '11/20/2026'].map(require('./src/common/normalize').parseRequiredBy)))"],
    { cwd: process.cwd(), env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    expect(JSON.parse(output)).toEqual(['2026-11-20', '2026-11-20']);
  });
});
