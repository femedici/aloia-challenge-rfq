import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { calculateQuote } from '../common/price';
import { validatePagination } from '../common/validation';
import { RfqSubmission } from '../erp/rfq-submission.entity';
import type { QuoteInput, RfqCanceledEvent, RfqCreatedEvent } from './rfq.types';
export type { QuoteInput } from './rfq.types';
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

    if (i.requiredBy !== undefined) {
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
    const submission = await this.rfqs.manager.getRepository(RfqSubmission).findOneBy({ rfqId });
    return { ...rfq, status: this.deriveStatus(rfq.items), submission: this.submissionView(submission) };
  }

  async list(page: number, pageSize: number) {
    validatePagination(page, pageSize);
    return this.rfqs.find({
      relations: { items: true },
      order: { createdAt: 'DESC', rfqId: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  private submissionView(submission: RfqSubmission | null) {
    return {
      status: submission?.status ?? 'not_sent', attempts: submission?.attempts ?? 0,
      startedAt: submission?.startedAt ?? null, completedAt: submission?.completedAt ?? null,
      nextAttemptAt: submission?.nextAttemptAt ?? null, erpOrderId: submission?.erpOrderId ?? null,
      lastError: submission?.lastError ?? null,
    };
  }

  async submit(rfqId: string) {
    return this.rfqs.manager.transaction(async (manager) => {
      await this.lockRfq(manager, rfqId);
      const submissions = manager.getRepository(RfqSubmission);
      const existing = await submissions.findOneBy({ rfqId });
      if (existing) return this.submissionView(existing);
      const rfq = await manager.getRepository(Rfq).findOne({ where: { rfqId }, relations: { items: true } });
      if (!rfq) throw new NotFoundException(`RFQ ${rfqId} não encontrado`);
      if (this.deriveStatus(rfq.items) !== 'READY') throw new ConflictException('RFQ precisa estar READY para enviar ao ERP');
      const submission = await submissions.save(submissions.create({
        rfqId, payload: {
          externalId: rfqId, customerCode: rfq.customerCode, currency: 'USD',
          lines: rfq.items.filter(item => item.status === 'quoted').sort((a, b) => a.lineNumber - b.lineNumber)
            .map(item => ({ lineNumber: item.lineNumber, partNumber: item.partNumber!, quantity: item.quantity,
              unit: item.unit!, unitPrice: item.unitPriceUsd! })),
        },
      }));
      return this.submissionView(submission);
    });
  }

  private async assertEditable(manager: EntityManager, rfqId: string) {
    if (await manager.getRepository(RfqSubmission).existsBy({ rfqId })) {
      throw new ConflictException('RFQ já enviado para processamento no ERP; cotação congelada');
    }
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
      await this.assertEditable(manager, rfqId);
      if (item.status !== 'pending' && item.status !== 'quoted') {
        throw new ConflictException(`Item em status ${item.status} não pode ser cotado`);
      }

      Object.assign(item, {
        supplier: input.supplier,
        currency: input.currency,
        unitCost: input.unitCost,
        moq: input.moq,
        freight: input.freight ?? '0',
        otherCharges: input.otherCharges ?? '0',
        customs: input.customs ?? '0',
        marginPercent: input.marginPercent,
        ...calculateQuote(item.quantity, input),
        status: 'quoted',
      });
      return manager.getRepository(RfqItem).save(item);
    });
  }

  async noQuote(rfqId: string, lineNumber: number) {
    return this.rfqs.manager.transaction(async (manager) => {
      await this.lockRfq(manager, rfqId);
      const item = await this.findItem(manager, rfqId, lineNumber);
      await this.assertEditable(manager, rfqId);
      if (item.status !== 'pending' && item.status !== 'quoted') {
        throw new ConflictException(`Item em status ${item.status} não pode virar no_quote`);
      }
      item.status = 'no_quote';
      return manager.getRepository(RfqItem).save(item);
    });
  }
}
