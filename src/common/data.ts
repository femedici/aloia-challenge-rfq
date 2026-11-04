import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const load = <T>(file: string): T => JSON.parse(readFileSync(join(process.cwd(), 'data', file), 'utf8'));

export const units = load<Record<string, string[]>>('units.json');
export const blacklist = load<string[]>('blacklist.json');
export const fxRates = load<Record<string, string>>('fx-rates.json');
