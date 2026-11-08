import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Rfq } from './rfq.entity';
import { RfqItem } from './rfq-item.entity';
import { RfqService } from './rfq.service';

const scenarios = {
  OPEN: ['pending', 'pending'],
  PARTIAL: ['quoted', 'pending', 'pending', 'pending'],
  READY: ['quoted', 'quoted'],
  MIXED: ['quoted', 'canceled', 'no_quote'],
  CLOSED: ['no_quote', 'canceled'],
  INVALID: ['invalid', 'invalid'],
};

@Injectable()
export class RfqDemoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RfqDemoService.name);
  constructor(private readonly db: DataSource) {}

  async onApplicationBootstrap() {
    if (process.env.DEMO_MODE !== 'true') return;
    if (process.env.NODE_ENV === 'production') throw new Error('DEMO_MODE não é permitido em produção');
    const round = process.env.DEMO_ROUND ?? '';
    if (round && !/^[A-Za-z0-9-]{1,32}$/.test(round)) throw new Error('DEMO_ROUND deve ter até 32 letras, números ou hífens');
    for (const [name, states] of Object.entries(scenarios)) {
      const rfqId = `RFQ-DEMO-${name}${round ? `-${round}` : ''}`;
      await this.db.transaction(async manager => {
        // Same lock as ordinary RFQ mutations; skip existing examples, never reset them.
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`rfq:${rfqId}`]);
        if (await manager.getRepository(Rfq).existsBy({ rfqId })) return;
        const service = new RfqService(manager.getRepository(Rfq), manager.getRepository(RfqItem));
        const occurredAt = new Date().toISOString();
        await service.processEvent({
          eventId: `demo:${rfqId}:created`, type: 'rfq.created', occurredAt,
          data: {
            rfqId, customer: { code: 'DEMO', name: `Demonstração — ${name}` },
            items: states.map((state, index) => ({
              lineNumber: index + 1, partNumber: state === 'invalid' ? '??' : `DEMO${index + 100}`,
              description: `Exemplo ${name} — item ${index + 1}`, quantity: 2, unit: 'EA',
            })),
          },
        });
        for (const [index, state] of states.entries()) {
          const line = index + 1;
          if (state === 'quoted') await service.quoteItem(rfqId, line, {
            supplier: 'Fornecedor demonstração', currency: 'USD', unitCost: '10.00', moq: 1, marginPercent: '20',
          });
          if (state === 'no_quote') await service.noQuote(rfqId, line);
          if (state === 'canceled') await service.processEvent({
            eventId: `demo:${rfqId}:canceled:${line}`, type: 'rfq.item_canceled', occurredAt,
            data: { rfqId, lineNumber: line, reason: 'Cancelamento de demonstração' },
          });
        }
      });
      this.logger.log(`Exemplo disponível (estado existente preservado): ${rfqId}`);
    }
  }
}
