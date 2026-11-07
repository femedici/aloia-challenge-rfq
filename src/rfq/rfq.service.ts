import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { fxRates } from '../common/data';
import {
  isBlacklisted,
  isValidPartNumber,
  normalizePartNumber,
  normalizeUnit,
  parseRequiredBy,
} from '../common/normalize';
import { Rfq } from './rfq.entity';
import { RfqItem } from './rfq-item.entity';
import { RfqEventRecord } from './rfq-event.entity';

export type RfqStatus = 'INVALID' | 'OPEN' | 'IN_PROGRESS' | 'READY' | 'CLOSED';

export interface RfqCreatedEvent {
  eventId: string;
  type: 'rfq.created';
  occurredAt: string;
  data: {
    rfqId: string;
    customer: { code: string; name: string };
    items: {
      lineNumber: number;
      partNumber: string;
      description?: string;
      quantity: number;
      unit: string;
      requiredBy?: string;
    }[];
  };
}

export interface RfqCanceledEvent {
  eventId: string;
  type: 'rfq.item_canceled';
  occurredAt: string;
  data: { rfqId: string; lineNumber: number; reason: string };
}

export interface QuoteInput {
  supplier: string;
  currency: string;
  unitCost: string;
  moq: number;
  freight?: string;
  otherCharges?: string;
  customs?: string;
  marginPercent: string;
}

@Injectable()
export class RfqService {
  private readonly logger = new Logger(RfqService.name);
  constructor(
    @InjectRepository(Rfq) private readonly rfqs: Repository<Rfq>,
    @InjectRepository(RfqItem) private readonly items: Repository<RfqItem>,
  ) {}

  async processEvent(event: RfqCreatedEvent | RfqCanceledEvent) {
    const rfqId = event.data.rfqId;
    return this.rfqs.manager.transaction(async (manager) => {
      const events = manager.getRepository(RfqEventRecord);
      // The unique insert arbitrates simultaneous deliveries; a preceding GET cannot.
      const claim = await events.createQueryBuilder().insert().values({
        eventId: event.eventId, rfqId, type: event.type,
        occurredAt: new Date(event.occurredAt), payload: event,
      }).orIgnore().returning(['eventId']).execute();
      if (!claim.raw.length) {
        this.logger.log({ eventId: event.eventId, rfqId, result: 'duplicate' });
        return;
      }
      await this.lockRfq(manager, rfqId);
      const rfqs = manager.getRepository(Rfq);
      let rfq = await rfqs.findOne({ where: { rfqId }, relations: { items: true } });
      if (event.type === 'rfq.created' && !rfq) {
        rfq = rfqs.create({
          rfqId, customerCode: event.data.customer.code, customerName: event.data.customer.name,
          items: event.data.items.map((item) => this.buildItem(item)),
        });
        this.flagDuplicates(rfq.items);
        rfq = await rfqs.save(rfq);
      }
      if (rfq) await this.applyCancellations(manager, rfq);
      await events.update(event.eventId, { completedAt: new Date() });
      this.logger.log({ eventId: event.eventId, rfqId, result: 'processed' });
    });
  }

  private lockRfq(manager: EntityManager, rfqId: string) {
    return manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`rfq:${rfqId}`]);
  }

  private async applyCancellations(manager: EntityManager, rfq: Rfq) {
    const cancellations = await manager.getRepository(RfqEventRecord).find({
      where: { rfqId: rfq.rfqId, type: 'rfq.item_canceled' },
      order: { occurredAt: 'ASC', eventId: 'ASC' },
    });
    const reasons = new Map<number, string>();
    for (const event of cancellations) {
      const data = (event.payload as RfqCanceledEvent).data;
      if (!reasons.has(data.lineNumber)) {
        reasons.set(data.lineNumber, data.reason);
      }
    }
    for (const item of rfq.items) {
      if (item.status === 'invalid' || !reasons.has(item.lineNumber)) continue;
      item.status = 'canceled';
      item.cancellationReason = reasons.get(item.lineNumber)!;
      await manager.getRepository(RfqItem).save(item);
    }
  }

  private buildItem(i: RfqCreatedEvent['data']['items'][number]): RfqItem {
    const item = this.items.create({
      lineNumber: i.lineNumber,
      rawPartNumber: i.partNumber,
      description: i.description,
      quantity: i.quantity,
      rawUnit: i.unit,
      rawRequiredBy: i.requiredBy,
      warnings: [],
    });

    const pn = normalizePartNumber(i.partNumber);
    const unit = normalizeUnit(i.unit);
    if (!isValidPartNumber(pn)) {
      item.status = 'invalid';
      item.invalidReason = 'invalid_part_number';
      return item;
    }
    item.partNumber = pn;
    if (!Number.isSafeInteger(i.quantity) || i.quantity <= 0) {
      item.status = 'invalid';
      item.invalidReason = 'invalid_quantity';
      return item;
    }
    if (!unit) {
      item.status = 'invalid';
      item.invalidReason = 'invalid_unit';
      return item;
    }
    item.unit = unit;

    if (i.requiredBy) {
      item.requiredBy = parseRequiredBy(i.requiredBy);
      if (!item.requiredBy) item.warnings.push('invalid_required_by');
    }

    item.status = isBlacklisted(pn) ? 'no_quote' : 'pending';
    return item;
  }

  private flagDuplicates(items: RfqItem[]) {
    const seen = new Map<string, number>();
    for (const item of [...items].sort((a, b) => a.lineNumber - b.lineNumber)) {
      if (item.status === 'invalid') continue;
      const key = `${item.partNumber}|${item.quantity}|${item.unit}`;
      const original = seen.get(key);
      if (original !== undefined) item.warnings.push(`possible_duplicate:${original}`);
      else seen.set(key, item.lineNumber);
    }
  }

  deriveStatus(items: RfqItem[]): RfqStatus {
    const valid = items.filter((i) => i.status !== 'invalid');
    if (valid.length === 0) return 'INVALID';
    const pending = valid.filter((i) => i.status === 'pending').length;
    const quoted = valid.filter((i) => i.status === 'quoted').length;
    if (pending === valid.length) return 'OPEN';
    if (pending > 0) return 'IN_PROGRESS';
    if (quoted > 0) return 'READY';
    return 'CLOSED';
  }

  async getRfq(rfqId: string) {
    const rfq = await this.rfqs.findOne({ where: { rfqId }, relations: { items: true } });
    if (!rfq) throw new NotFoundException(`RFQ ${rfqId} não encontrado`);
    rfq.items.sort((a, b) => a.lineNumber - b.lineNumber);
    return { ...rfq, status: this.deriveStatus(rfq.items) };
  }

  async list(page: number, pageSize: number) {
    return this.rfqs.find({
      relations: { items: true },
      order: { createdAt: 'DESC', rfqId: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  private async findItem(manager: EntityManager, rfqId: string, lineNumber: number) {
    const item = await manager.getRepository(RfqItem).findOne({
      where: { rfq: { rfqId }, lineNumber },
      relations: { rfq: true },
    });
    if (!item) throw new NotFoundException(`Item ${lineNumber} do RFQ ${rfqId} não encontrado`);
    return item;
  }

  async quoteItem(rfqId: string, lineNumber: number, input: QuoteInput) {
    return this.rfqs.manager.transaction(async (manager) => {
      await this.lockRfq(manager, rfqId);
      const item = await this.findItem(manager, rfqId, lineNumber);
      if (item.status !== 'pending' && item.status !== 'quoted') {
        throw new ConflictException(`Item em status ${item.status} não pode ser cotado`);
      }

      const rates = fxRates;
      if (!rates[input.currency] || input.currency.startsWith('_')) {
        throw new BadRequestException('currency inválida');
      }
      const unitCost = Number(input.unitCost);
      const margin = Number(input.marginPercent);
      if (!(unitCost > 0)) throw new BadRequestException('unitCost deve ser maior que 0');
      if (!(margin >= 0 && margin <= 300)) throw new BadRequestException('marginPercent deve estar entre 0 e 300');

      const fees = Number(input.freight ?? 0) + Number(input.otherCharges ?? 0) + Number(input.customs ?? 0);
      const purchasedQty = Math.max(item.quantity, input.moq ?? 0);
      const unitLanded = (unitCost * purchasedQty + fees) / item.quantity;
      const unitPrice = unitLanded * (1 + margin / 100) * Number(rates[input.currency]);

      Object.assign(item, {
        supplier: input.supplier,
        currency: input.currency,
        unitCost: input.unitCost,
        moq: input.moq,
        freight: input.freight,
        otherCharges: input.otherCharges,
        customs: input.customs,
        marginPercent: input.marginPercent,
        unitPriceUsd: unitPrice.toFixed(2),
        totalPriceUsd: (Number(unitPrice.toFixed(2)) * item.quantity).toFixed(2),
        status: 'quoted',
      });
      return manager.getRepository(RfqItem).save(item);
    });
  }

  async noQuote(rfqId: string, lineNumber: number) {
    return this.rfqs.manager.transaction(async (manager) => {
      await this.lockRfq(manager, rfqId);
      const item = await this.findItem(manager, rfqId, lineNumber);
      if (item.status !== 'pending' && item.status !== 'quoted') {
        throw new ConflictException(`Item em status ${item.status} não pode virar no_quote`);
      }
      item.status = 'no_quote';
      return manager.getRepository(RfqItem).save(item);
    });
  }
}
