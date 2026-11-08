import { Body, Controller, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';
import { RfqService } from './rfq.service';
import { validateLineNumber, validateQuoteInput } from '../common/validation';

@Controller('rfqs/:rfqId/items')
@UseGuards(ApiKeyGuard)
export class ItemsController {
  constructor(private readonly rfqService: RfqService) {}

  @Put(':lineNumber/quote')
  quote(
    @Param('rfqId') rfqId: string,
    @Param('lineNumber', ParseIntPipe) lineNumber: number,
    @Body() body: unknown,
  ) {
    validateLineNumber(lineNumber);
    validateQuoteInput(body);
    return this.rfqService.quoteItem(rfqId, lineNumber, body);
  }

  @Post(':lineNumber/no-quote')
  noQuote(@Param('rfqId') rfqId: string, @Param('lineNumber', ParseIntPipe) lineNumber: number) {
    validateLineNumber(lineNumber);
    return this.rfqService.noQuote(rfqId, lineNumber);
  }
}
