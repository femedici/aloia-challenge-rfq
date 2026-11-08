import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('rfq_event')
export class RfqEventRecord {
  @PrimaryColumn()
  eventId: string;

  @Index()
  @Column()
  rfqId: string;

  @Column()
  type: string;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'jsonb' })
  payload: object;

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
