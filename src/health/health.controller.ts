import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/api-key.guard';

@Controller('health')
@UseGuards(ApiKeyGuard)
export class HealthController {
  @Get()
  check() {
    return { ok: true };
  }
}
