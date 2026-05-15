import { Module } from '@nestjs/common';
import { SheetsDbService } from './sheets-db.service';

@Module({
  providers: [SheetsDbService],
  exports: [SheetsDbService],
})
export class SheetsDbModule {}
