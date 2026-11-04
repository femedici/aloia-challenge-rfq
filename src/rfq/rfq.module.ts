import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemsController } from './items.controller';
import { RfqController } from './rfq.controller';
import { Rfq } from './rfq.entity';
import { RfqItem } from './rfq-item.entity';
import { RfqService } from './rfq.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Rfq, RfqItem])],
  controllers: [WebhookController, RfqController, ItemsController],
  providers: [RfqService],
  exports: [RfqService],
})
export class RfqModule {}
