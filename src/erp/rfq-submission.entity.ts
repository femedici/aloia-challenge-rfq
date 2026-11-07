import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ErpOrder } from './erp.client';

export type SubmissionStatus = 'pending' | 'sending' | 'retry_wait' | 'reconciling' | 'sent' | 'failed';

@Entity('rfq_submission')
export class RfqSubmission {
  @PrimaryColumn()
  rfqId: string;

  @Column('jsonb')
  payload: ErpOrder;

  @Column({ default: 'pending' })
  status: SubmissionStatus;

  @Column({ default: 0 })
  attempts: number;

  @Column('timestamptz', { nullable: true })
  nextAttemptAt: Date | null;

  @Column('timestamptz', { nullable: true })
  startedAt: Date | null;

  @Column('timestamptz', { nullable: true })
  completedAt: Date | null;

  @Column('text', { nullable: true })
  erpOrderId: string | null;

  @Column('text', { nullable: true })
  lastError: string | null;
}
