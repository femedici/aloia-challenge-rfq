import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import { RfqService } from './rfq.service';

@Controller('rfqs')
@UseGuards(ApiKeyGuard)
export class RfqController {
  constructor(private readonly rfqService: RfqService) {}

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    const rfqs = await this.rfqService.list(page, pageSize);
    return rfqs.map((rfq) => {
      return {
        rfqId: rfq.rfqId,
        customerName: rfq.customerName,
        itemCount: rfq.items.length,
        status: this.rfqService.deriveStatus(rfq.items),
        createdAt: rfq.createdAt,
      };
    });
  }

  @Get(':rfqId')
  get(@Param('rfqId') rfqId: string) {
    return this.rfqService.getRfq(rfqId);
  }
}
