import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac } from 'node:crypto';
import { RfqService } from './rfq.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly rfqService: RfqService) {}

  @Post('rfq')
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Body() body: any) {
    const expected =
      'sha256=' + createHmac('sha256', process.env.WEBHOOK_SECRET!).update(req.rawBody!).digest('hex');
    if (req.headers['x-signature'] !== expected) {
      throw new UnauthorizedException('assinatura inválida');
    }

    switch (body?.type) {
      case 'rfq.created':
        await this.rfqService.createFromEvent(body);
        return { ok: true };
      default:
        throw new BadRequestException(`tipo de evento não suportado: ${body?.type}`);
    }
  }
}
