import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { DocumentsService } from './documents.service.js';
import { ErpController } from './erp.controller.js';
import { BankService } from './bank.service.js';
@Module({
  controllers: [ErpController],
  providers: [CatalogService, DocumentsService, BankService],
})
export class ErpModule {}
