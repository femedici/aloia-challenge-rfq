import { Module } from '@nestjs/common';
import { ErpClient } from './erp.client';

@Module({
  providers: [ErpClient],
  exports: [ErpClient],
})
export class ErpModule {}
