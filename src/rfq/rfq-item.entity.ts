import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Rfq } from './rfq.entity';

export type ItemStatus = 'pending' | 'quoted' | 'no_quote' | 'canceled' | 'invalid';

@Entity('rfq_item')
export class RfqItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Rfq, (rfq) => rfq.items, { onDelete: 'CASCADE' })
  rfq: Rfq;

  @Column()
  lineNumber: number;

  @Column()
  rawPartNumber: string;

  @Column({ nullable: true })
  partNumber: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  quantity: number;

  @Column()
  rawUnit: string;

  @Column({ nullable: true })
  unit: string;

  @Column({ nullable: true })
  rawRequiredBy: string;

  @Column({ nullable: true })
  requiredBy: string;

  @Column({ default: 'pending' })
  status: ItemStatus;

  @Column({ nullable: true })
  invalidReason: string;

  @Column({ type: 'simple-json', default: '[]' })
  warnings: string[];

  @Column({ nullable: true })
  supplier: string;

  @Column({ nullable: true })
  currency: string;

  @Column({ nullable: true })
  unitCost: string;

  @Column({ nullable: true })
  moq: number;

  @Column({ nullable: true })
  freight: string;

  @Column({ nullable: true })
  otherCharges: string;

  @Column({ nullable: true })
  customs: string;

  @Column({ nullable: true })
  marginPercent: string;

  @Column({ nullable: true })
  unitPriceUsd: string;

  @Column({ nullable: true })
  totalPriceUsd: string;
}
