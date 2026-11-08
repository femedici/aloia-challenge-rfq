import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ErpClient, ErpHttpError } from './erp.client';
import { RfqSubmission, SubmissionStatus } from './rfq-submission.entity';

const activeStatuses: SubmissionStatus[] = ['pending', 'sending', 'retry_wait', 'reconciling'];

@Injectable()
export class ErpSubmissionWorker implements OnApplicationBootstrap, BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly logger = new Logger(ErpSubmissionWorker.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;

  constructor(private readonly database: DataSource, private readonly client: ErpClient) {}

  onApplicationBootstrap() {
    const tick = async () => {
      await this.runOnce();
      if (!this.stopping) this.timer = setTimeout(tick, 1_000);
    };
    void tick();
  }

  beforeApplicationShutdown() { return this.onApplicationShutdown(); }

  async onApplicationShutdown() {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.running;
  }

  runOnce(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.processDue()
      .catch(() => { this.logger.error({ result: 'worker_database_error' }); })
      .finally(() => { this.running = undefined; });
    return this.running;
  }

  private async processDue() {
    const due = await this.database.getRepository(RfqSubmission).createQueryBuilder('submission')
      .where('submission.status IN (:...statuses)', { statuses: activeStatuses })
      .andWhere('(submission.nextAttemptAt IS NULL OR submission.nextAttemptAt <= :now)', { now: new Date() })
      .orderBy('submission.nextAttemptAt', 'ASC', 'NULLS FIRST').addOrderBy('submission.rfqId', 'ASC')
      .take(20).getMany();
    for (const submission of due) {
      if (this.stopping) break;
      try { await this.process(submission.rfqId); }
      catch { this.logger.error({ rfqId: submission.rfqId, attempt: submission.attempts, result: 'delivery_database_error' }); }
    }
  }

  private async process(rfqId: string) {
    const runner = this.database.createQueryRunner();
    const lock = `erp-submission:${rfqId}`;
    let locked = false;
    let connection: { end(): Promise<void> } | undefined;
    try {
      connection = await runner.connect();
      [{ locked }] = await runner.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [lock]);
      if (!locked) return;
      const repository = runner.manager.getRepository(RfqSubmission);
      const submission = await repository.findOneBy({ rfqId });
      if (!submission || !activeStatuses.includes(submission.status) || submission.nextAttemptAt?.getTime() > Date.now()) return;
      if (!submission.startedAt) await this.update(repository, submission, { startedAt: new Date() });
      if (submission.status === 'sending') {
        await this.update(repository, submission, { status: 'reconciling' });
      }
      await this.deliver(repository, submission);
    } finally {
      try {
        if (locked) await runner.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lock]);
      } catch (error) {
        // Never return a session with an unreleased advisory lock to the pool.
        await connection?.end();
        throw error;
      } finally {
        await runner.release();
      }
    }
  }

  private async deliver(repository: Repository<RfqSubmission>, submission: RfqSubmission) {
    let orders;
    try {
      orders = await this.client.findOrders(submission.rfqId);
    } catch (error) {
      if (submission.status !== 'reconciling' && error instanceof ErpHttpError && [400, 401, 422].includes(error.status)) {
        await this.finish(repository, submission, 'failed', error.message);
      } else {
        await this.defer(repository, submission, submission.status === 'reconciling' ? 'reconciling' : 'retry_wait', error);
      }
      return;
    }
    if (orders.length > 1) {
      await this.finish(repository, submission, 'failed', 'ERP integrity failure: multiple orders found for this RFQ');
      return;
    }
    if (orders.length === 1) {
      await this.finish(repository, submission, 'sent', null, orders[0].id);
      return;
    }
    if (submission.status === 'reconciling') {
      await this.defer(repository, submission, 'reconciling');
      return;
    }

    // Commit send intent before networking: a crash here must resume with lookup only.
    await this.update(repository, submission, {
      status: 'sending', attempts: submission.attempts + 1, startedAt: submission.startedAt ?? new Date(),
      nextAttemptAt: null, lastError: null,
    });
    let receipt;
    try {
      receipt = await this.client.createOrder({ ...submission.payload, externalId: submission.rfqId });
    } catch (error) {
      if (error instanceof ErpHttpError && [400, 401, 422].includes(error.status)) {
        await this.finish(repository, submission, 'failed', error.message);
      } else {
        const safeRetry = error instanceof ErpHttpError && [429, 503].includes(error.status);
        await this.defer(repository, submission, safeRetry ? 'retry_wait' : 'reconciling', error);
      }
      return;
    }
    await this.finish(repository, submission, 'sent', null, receipt.id);
  }

  private async defer(repository: Repository<RfqSubmission>, submission: RfqSubmission, status: 'retry_wait' | 'reconciling', error?: unknown) {
    const backoff = Math.min(60_000, 1_000 * 2 ** Math.min(6, Math.max(0, submission.attempts - 1)));
    const delay = Math.max(backoff, error instanceof ErpHttpError ? error.retryAfterMs ?? 0 : 0);
    const reason = error instanceof ErpHttpError ? error.message : status === 'reconciling'
      ? 'ERP outcome uncertain; reconciling only until an order is found'
      : 'ERP lookup unavailable or invalid; waiting before delivery';
    await this.update(repository, submission, {
      status, nextAttemptAt: new Date(Math.min(8_640_000_000_000_000, Date.now() + delay)), lastError: reason,
    });
  }

  private finish(repository: Repository<RfqSubmission>, submission: RfqSubmission, status: 'sent' | 'failed', lastError: string | null, erpOrderId: string | null = null) {
    return this.update(repository, submission, { status, lastError, erpOrderId, completedAt: new Date(), nextAttemptAt: null });
  }

  private async update(repository: Repository<RfqSubmission>, submission: RfqSubmission, values: Partial<RfqSubmission>) {
    await repository.update(submission.rfqId, values);
    Object.assign(submission, values);
    this.logger.log({ rfqId: submission.rfqId, attempt: submission.attempts, result: submission.status });
  }
}
