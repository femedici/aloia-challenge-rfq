import { RfqDemoService } from './rfq-demo.service';
import { RfqSubmission } from '../erp/rfq-submission.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsController } from './items.controller';
import { RfqController } from './rfq.controller';
import { Rfq } from './rfq.entity';
import { RfqItem } from './rfq-item.entity';
import { RfqService } from './rfq.service';
import { WebhookController } from './webhook.controller';
import { RfqEventRecord } from './rfq-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Rfq, RfqItem, RfqEventRecord, RfqSubmission])],
  controllers: [WebhookController, RfqController, ItemsController],
  providers: [RfqService, RfqDemoService],
  exports: [RfqService],
})
export class RfqModule {}
