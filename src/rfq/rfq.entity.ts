import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RfqItem } from './rfq-item.entity';

@Entity('rfq')
export class Rfq {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  rfqId: string;

  @Column()
  customerCode: string;

  @Column()
  customerName: string;

  @OneToMany(() => RfqItem, (item) => item.rfq, { cascade: true })
  items: RfqItem[];

  @CreateDateColumn()
  createdAt: Date;
}
