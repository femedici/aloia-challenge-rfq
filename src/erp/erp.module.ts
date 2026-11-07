import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErpClient } from './erp.client';
import { ErpSubmissionWorker } from './erp-submission.worker';
import { RfqSubmission } from './rfq-submission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RfqSubmission])],
  providers: [ErpClient, ErpSubmissionWorker],
  exports: [ErpClient, ErpSubmissionWorker, TypeOrmModule],
})
export class ErpModule {}
