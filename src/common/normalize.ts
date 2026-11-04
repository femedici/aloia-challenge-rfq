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

export function isBlacklisted(pn: string): boolean {
  return blacklist.includes(pn);
}

const pad = (n: number) => String(n).padStart(2, '0');

// Aceita YYYY-MM-DD e MM/DD/YYYY. Retorna YYYY-MM-DD ou null.
export function parseRequiredBy(raw: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) && !/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
