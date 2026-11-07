import { BadRequestException } from '@nestjs/common';
import type { QuoteInput, RfqEvent } from '../rfq/rfq.types';
import { fxRates } from './data';
import { parseRequiredBy } from './normalize';

function object(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${field} deve ser um objeto`);
  }
}

function text(value: unknown, field: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || value.includes('\0') || (!allowEmpty && !value.trim())) {
    throw new BadRequestException(`${field} deve ser um texto${allowEmpty ? '' : ' não vazio'}`);
  }
}

function identifier(value: unknown, field: string): asserts value is string {
  text(value, field);
  if (value.length > 200) throw new BadRequestException(`${field} deve ter até 200 caracteres`);
}

function integer(value: unknown, field: string, minimum = 1): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > 2147483647) {
    throw new BadRequestException(`${field} deve ser inteiro entre ${minimum} e 2147483647`);
  }
}

function decimal(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length > 64 || !/^\d+(\.\d+)?$/.test(value)) {
    throw new BadRequestException(`${field} deve ser um decimal não negativo, com até 64 caracteres`);
  }
}

export function validateWebhookEvent(value: unknown): asserts value is RfqEvent {
  object(value, 'event');
  identifier(value.eventId, 'eventId');
  if (value.type !== 'rfq.created' && value.type !== 'rfq.item_canceled') {
    throw new BadRequestException('type deve ser rfq.created ou rfq.item_canceled');
  }
  text(value.occurredAt, 'occurredAt');
  const timestamp = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value.occurredAt);
  if (!timestamp || !parseRequiredBy(timestamp[1]) || !Number.isFinite(Date.parse(value.occurredAt))) {
    throw new BadRequestException('occurredAt deve ser uma data/hora ISO válida com fuso');
  }
  object(value.data, 'data');
  const data = value.data;
  identifier(data.rfqId, 'data.rfqId');
  if (value.type === 'rfq.item_canceled') {
    integer(data.lineNumber, 'data.lineNumber');
    text(data.reason, 'data.reason');
    return;
  }

  object(data.customer, 'data.customer');
  text(data.customer.code, 'data.customer.code');
  text(data.customer.name, 'data.customer.name');
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new BadRequestException('data.items deve ser uma lista não vazia');
  }
  const lines = new Set<number>();
  for (const [index, item] of data.items.entries()) {
    const path = `data.items[${index}]`;
    object(item, path);
    integer(item.lineNumber, `${path}.lineNumber`);
    if (lines.has(item.lineNumber)) throw new BadRequestException(`${path}.lineNumber duplicado`);
    lines.add(item.lineNumber);
    // Domain-invalid values are retained as invalid items by the RFQ service.
    text(item.partNumber, `${path}.partNumber`, true);
    text(item.unit, `${path}.unit`, true);
    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity)) {
      throw new BadRequestException(`${path}.quantity deve ser um número finito`);
    }
    if (item.description !== undefined) text(item.description, `${path}.description`, true);
    if (item.requiredBy !== undefined) text(item.requiredBy, `${path}.requiredBy`, true);
  }
}

export function validateQuoteInput(value: unknown): asserts value is QuoteInput {
  object(value, 'quote');
  text(value.supplier, 'supplier');
  text(value.currency, 'currency');
  if (value.currency.startsWith('_') || !Object.hasOwn(fxRates, value.currency)) {
    throw new BadRequestException('currency inválida');
  }
  decimal(value.unitCost, 'unitCost');
  if (!/[1-9]/.test(value.unitCost)) throw new BadRequestException('unitCost deve ser maior que 0');
  integer(value.moq, 'moq', 0);
  for (const field of ['freight', 'otherCharges', 'customs']) {
    if (value[field] !== undefined) decimal(value[field], field);
  }
  decimal(value.marginPercent, 'marginPercent');
  const [whole, fraction = ''] = value.marginPercent.split('.');
  if (BigInt(whole + fraction) > 300n * 10n ** BigInt(fraction.length)) {
    throw new BadRequestException('marginPercent deve estar entre 0 e 300');
  }
}

export function validatePagination(page: unknown, pageSize: unknown): void {
  if (!Number.isSafeInteger(page) || (page as number) < 1) {
    throw new BadRequestException('page deve ser um inteiro positivo seguro');
  }
  if (!Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > 100) {
    throw new BadRequestException('pageSize deve ser um inteiro entre 1 e 100');
  }
  if (!Number.isSafeInteger(((page as number) - 1) * (pageSize as number))) {
    throw new BadRequestException('page resulta em um offset fora do limite seguro');
  }
}
