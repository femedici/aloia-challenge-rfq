import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
    @Query() options: unknown,
  ) {
    const rfqs = await this.rfqService.list(page, pageSize, options);
    return rfqs.map((rfq) => {
      return {
        rfqId: rfq.rfqId,
        customerName: rfq.customerName,
        itemCount: rfq.items.length,
        status: this.rfqService.deriveStatus(rfq.items),
        submissionStatus: rfq.submissionStatus,
        createdAt: rfq.createdAt,
      };
    });
  }

  @Post(':rfqId/submit')
  async submit(@Param('rfqId') rfqId: string, @Res({ passthrough: true }) response: Response) {
    const submission = await this.rfqService.submit(rfqId);
    response.status(['sent', 'failed'].includes(submission.status) ? 200 : 202);
    return submission;
  }

  @Get(':rfqId')
  get(@Param('rfqId') rfqId: string) {
    return this.rfqService.getRfq(rfqId);
  }
}
