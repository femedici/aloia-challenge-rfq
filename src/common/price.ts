import { BadRequestException } from '@nestjs/common';
import type { QuoteInput } from '../rfq/rfq.types';
import { fxRates } from './data';
import { validateQuoteInput } from './validation';

const formatCents = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

export function calculateQuote(quantity: number, input: QuoteInput): { unitPriceUsd: string; totalPriceUsd: string } {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new BadRequestException('quantity deve ser um inteiro positivo seguro');
  }
  validateQuoteInput(input);
  const decimals = [input.unitCost, input.freight ?? '0', input.otherCharges ?? '0',
    input.customs ?? '0', input.marginPercent, fxRates[input.currency]]
    .map((value) => value.split('.'));
  const precision = Math.max(...decimals.map(([, fraction = '']) => fraction.length));
  const scale = 10n ** BigInt(precision);
  const [unitCost, freight, otherCharges, customs, margin, rate] = decimals.map(
    ([whole, fraction = '']) => BigInt(whole + fraction.padEnd(precision, '0')),
  );
  const cost = unitCost * BigInt(Math.max(quantity, input.moq)) + freight + otherCharges + customs;
  const numerator = cost * (100n * scale + margin) * rate * 100n;
  const denominator = BigInt(quantity) * 100n * scale ** 3n;
  // Keep the complete rational price until the single half-up rounding to cents.
  const unitCents = (2n * numerator + denominator) / (2n * denominator);
  return { unitPriceUsd: formatCents(unitCents), totalPriceUsd: formatCents(unitCents * BigInt(quantity)) };
}
