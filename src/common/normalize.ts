import { blacklist, units } from './data';

export function normalizePartNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s\-./]/g, '');
}

export function isValidPartNumber(pn: string): boolean {
  return /^[A-Z0-9]{3,}$/.test(pn);
}

export function normalizeUnit(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  for (const [unit, aliases] of Object.entries(units)) {
    if (aliases.includes(value)) return unit;
  }
  return null;
}

const normalizedBlacklist = new Set(blacklist.map(normalizePartNumber));

export function isBlacklisted(pn: string): boolean {
  return normalizedBlacklist.has(normalizePartNumber(pn));
}

// Aceita YYYY-MM-DD e MM/DD/YYYY. Retorna YYYY-MM-DD ou null.
export function parseRequiredBy(raw: string): string | null {
  let parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)?.slice(1);
  if (!parts) {
    const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (!us) return null;
    parts = [us[3], us[1], us[2]];
  }
  const [year, month, day] = parts.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  return parts.join('-');
}
