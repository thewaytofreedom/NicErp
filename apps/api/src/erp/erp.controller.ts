import {
  BadRequestException,
  HttpException,
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogService } from './catalog.service.js';
import { DocumentsService } from './documents.service.js';
import { BankService } from './bank.service.js';
import { object, list } from '../common/input.js';
import { permit, type AppRequest } from '../common/context.js';
@ApiTags('erp')
@ApiBearerAuth()
@Controller('erp')
export class ErpController {
  constructor(
    private catalog: CatalogService,
    private documents: DocumentsService,
    private bank: BankService,
  ) {}
  @Post('bank/transaction') bankTransaction(@Req() r: AppRequest, @Body() b: unknown) {
    return this.bank.post(r.auth, b);
  }
  @Post('bank/transfer') bankTransfer(@Req() r: AppRequest, @Body() b: unknown) {
    return this.bank.post(r.auth, b, true);
  }
  @Post('bank/reconcile') bankReconcile(@Req() r: AppRequest, @Body() b: unknown) {
    return this.bank.reconcile(r.auth, b);
  }
  @Post('bank/:id/reverse') bankReverse(@Req() r: AppRequest, @Param('id') id: string) {
    return this.bank.reverse(r.auth, id);
  }
  @Post('import/:resource') async importRows(
    @Req() r: AppRequest,
    @Param('resource') resource: string,
    @Body() raw: unknown,
  ) {
    if (!['products', 'partners'].includes(resource))
      throw new BadRequestException('此资源不支持导入');
    permit(r.auth, resource === 'products' ? 'catalog' : 'partners');
    const rows = list(object(raw), 'rows', 200);
    let created = 0;
    const errors: { row: number; message: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        await this.catalog.save(r.auth, resource, rows[i]);
        created++;
      } catch (error) {
        errors.push({
          row: i + 2,
          message:
            error instanceof HttpException
              ? error.message
              : (error as { code?: string }).code === 'P2002'
                ? '编号已存在'
                : '此行导入失败',
        });
      }
    }
    return { created, errors };
  }
  @Get('bootstrap') bootstrap(@Req() r: AppRequest) {
    return this.catalog.bootstrap(r.auth);
  }
  @Get('dashboard') dashboard(@Req() r: AppRequest) {
    return this.catalog.dashboard(r.auth);
  }
  @Get('posts/:id') post(@Req() r: AppRequest, @Param('id') id: string) {
    return this.catalog.post(r.auth, id);
  }
  @Get('documents') documentsList(@Req() r: AppRequest, @Query() q: Record<string, string>) {
    return this.documents.read(r.auth, q);
  }
  @Post('documents/import-lines') importLines(@Req() r: AppRequest, @Body() b: unknown) {
    return this.documents.importLines(r.auth, b);
  }
  @Post('documents/transform-lines') transformLines(@Req() r: AppRequest, @Body() b: unknown) {
    return this.documents.transformLines(r.auth, b);
  }
  @Post('documents/purchase-price') purchasePrice(@Req() r: AppRequest, @Body() b: unknown) {
    return this.documents.purchasePrice(r.auth, b);
  }
  @Get('documents/:id') document(@Req() r: AppRequest, @Param('id') id: string) {
    return this.documents.detail(r.auth, id);
  }
  @Post('documents') createDocument(@Req() r: AppRequest, @Body() b: unknown) {
    return this.documents.save(r.auth, b);
  }
  @Patch('documents/:id') updateDocument(
    @Req() r: AppRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.documents.save(r.auth, b, id);
  }
  @Post('documents/:id/convert') convert(
    @Req() r: AppRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.documents.convert(r.auth, id, b);
  }
  @Post('documents/:id/fulfill') fulfill(
    @Req() r: AppRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.documents.fulfill(r.auth, id, b);
  }
  @Post('documents/:id/pay') pay(
    @Req() r: AppRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.documents.pay(r.auth, id, b);
  }
  @Post('documents/:id/:action') transition(
    @Req() r: AppRequest,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    if (action === 'clone') return this.documents.clone(r.auth, id);
    return this.documents.transition(r.auth, id, action, body);
  }
  @Post('inventory/transfer') transfer(@Req() r: AppRequest, @Body() b: unknown) {
    return this.documents.transfer(r.auth, b);
  }
  @Post('inventory/adjust') adjust(@Req() r: AppRequest, @Body() b: unknown) {
    return this.documents.adjust(r.auth, b);
  }
  @Post('payments/:id/reverse') reverse(@Req() r: AppRequest, @Param('id') id: string) {
    return this.documents.reversePayment(r.auth, id);
  }
  @Delete('users/:id') removeUser(@Req() r: AppRequest, @Param('id') id: string) {
    return this.catalog.removeUser(r.auth, id);
  }
  @Get(':resource') read(
    @Req() r: AppRequest,
    @Param('resource') resource: string,
    @Query() q: Record<string, string>,
  ) {
    return this.catalog.read(r.auth, resource, q);
  }
  @Post(':resource') create(
    @Req() r: AppRequest,
    @Param('resource') resource: string,
    @Body() b: unknown,
  ) {
    return this.catalog.save(r.auth, resource, b);
  }
  @Patch(':resource/:id') update(
    @Req() r: AppRequest,
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.catalog.save(r.auth, resource, b, id);
  }
}
