import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RfqService } from './rfq.service';
import { validateWebhookEvent } from '../common/validation';
import { ApiKeyGuard } from '../common/api-key.guard';

@Controller('webhooks')
@UseGuards(ApiKeyGuard)
export class WebhookController {
  constructor(private readonly rfqService: RfqService) {}

  @Post('rfq')
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    const secret = process.env.WEBHOOK_SECRET;
    const signature = req.headers['x-signature'];
    if (!secret || !req.rawBody || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) {
      throw new UnauthorizedException('assinatura inválida');
    }
    const expected = createHmac('sha256', secret).update(req.rawBody).digest();
    if (!timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), expected)) {
      throw new UnauthorizedException('assinatura inválida');
    }

    validateWebhookEvent(body);
    await this.rfqService.processEvent(body);
    return { ok: true };
  }
}
