import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health/health.controller';
import { RfqModule } from './rfq/rfq.module';
import { ErpModule } from './erp/erp.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: true,
    }),
    RfqModule,
    ErpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
