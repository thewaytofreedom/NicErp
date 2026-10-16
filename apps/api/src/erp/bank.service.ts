import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { atomic, audit } from '../database/transaction.js';
import { permit, type Context } from '../common/context.js';
import { object, str, id, dec, date, choice, bool } from '../common/input.js';
import { owned } from './catalog.service.js';

@Injectable()
export class BankService {
  constructor(private db: PrismaService) {}
  async post(c: Context, raw: unknown, transfer = false) {
    permit(c, 'finance');
    const b = object(raw),
      accountId = id(b, 'accountId')!,
      targetAccountId = transfer ? id(b, 'targetAccountId')! : null,
      kind = transfer ? 'BANK_TRANSFER' : choice(b, 'direction', ['IN', 'OUT']),
      amount = dec(b, 'amount', '0', '0.01', '999999999999', 2),
      at = date(b, 'date')!,
      requestKey = str(b, 'requestKey', 100),
      reference = str(b, 'reference', 200, ''),
      category = str(b, 'category', 200, ''),
      note = str(b, 'note', 2000, '');
    if (accountId === targetAccountId) throw new BadRequestException('调出与调入账户不能相同');
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          accountId,
          targetAccountId,
          kind,
          amount: amount.toString(),
          at,
          reference,
          category,
          note,
        }),
      )
      .digest('hex');
    return atomic(this.db, async (tx) => {
      const prior = await tx.bankOperation.findUnique({
        where: { companyId_requestKey: { companyId: c.companyId, requestKey } },
      });
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new ConflictException('重复请求内容不一致');
        return prior;
      }
      const source = await owned(
        await tx.bankAccount.findFirst({
          where: { id: accountId, companyId: c.companyId, active: true },
        }),
      );
      if (targetAccountId) {
        const target = await owned(
          await tx.bankAccount.findFirst({
            where: { id: targetAccountId, companyId: c.companyId, active: true },
          }),
        );
        if (source.currency !== target.currency)
          throw new BadRequestException('转账账户必须同币种');
      }
      const entries = [
        {
          accountId,
          amount: kind === 'IN' ? amount : amount.negated(),
          date: at,
          reference,
          category,
          note,
        },
      ];
      if (targetAccountId)
        entries.push({ accountId: targetAccountId, amount, date: at, reference, category, note });
      const result = await tx.bankOperation.create({
        data: {
          companyId: c.companyId,
          kind,
          requestKey,
          fingerprint,
          entries: { create: entries },
        },
      });
      await audit(
        tx,
        c,
        kind,
        'bank',
        result.id,
        `${source.name} ${amount.toString()} ${source.currency}`,
      );
      return result;
    });
  }
  async reverse(c: Context, operationId: string) {
    permit(c, 'finance');
    id({ operationId }, 'operationId');
    return atomic(this.db, async (tx) => {
      const op = await owned(
        await tx.bankOperation.findFirst({
          where: { id: operationId, companyId: c.companyId },
          include: { entries: true },
        }),
      );
      if (op.entries.some((e) => e.reconciledAt))
        throw new ConflictException('请先取消对账，再冲销整笔操作');
      // 若流水来自登记收付款，一并冲销关联的收付款并恢复单据未付余额。
      for (const entry of op.entries) {
        if (!entry.paymentId) continue;
        const payment = await tx.payment.findUnique({ where: { id: entry.paymentId } });
        if (!payment) continue;
        if (payment.reconciledAt)
          throw new ConflictException('请先取消银行对账，再冲销付款');
        await tx.document.update({
          where: { id: payment.documentId },
          data: { paidAmount: { decrement: payment.amount }, version: { increment: 1 } },
        });
        await tx.payment.delete({ where: { id: payment.id } });
        await audit(tx, c, 'REVERSE', 'payments', payment.id);
      }
      await tx.bankEntry.deleteMany({ where: { operationId: op.id } });
      await tx.bankOperation.delete({ where: { id: op.id } });
      await audit(tx, c, 'REVERSE', 'bank', op.id);
      return { id: op.id };
    });
  }
  async reconcile(c: Context, raw: unknown) {
    permit(c, 'finance');
    const b = object(raw),
      entryId = id(b, 'entryId', true),
      paymentId = id(b, 'paymentId', true),
      reconcile = bool(b, 'reconcile', true);
    if (!!entryId === !!paymentId) throw new BadRequestException('请选择一条资金或付款流水');
    const data = {
      reconciledAt: reconcile ? new Date() : null,
      statementNumber: reconcile ? str(b, 'statementNumber', 200) : '',
    };
    return atomic(this.db, async (tx) => {
      if (entryId) {
        const entry = await owned(
          await tx.bankEntry.findFirst({
            where: { id: entryId, account: { companyId: c.companyId } },
            include: { operation: true },
          }),
        );
        if (entry.operation.reversedAt) throw new ConflictException('已冲销流水不能对账');
        await tx.bankEntry.update({ where: { id: entry.id }, data });
        // 同步关联收付款的对账状态
        if (entry.paymentId)
          await tx.payment.update({ where: { id: entry.paymentId }, data });
      } else {
        const payment = await owned(
          await tx.payment.findFirst({
            where: { id: paymentId!, document: { companyId: c.companyId } },
          }),
        );
        if (payment.reversedAt) throw new ConflictException('已冲销付款不能对账');
        await tx.payment.update({ where: { id: payment.id }, data });
        // 同步关联资金收支的对账状态
        const entry = await tx.bankEntry.findUnique({ where: { paymentId: payment.id } });
        if (entry) await tx.bankEntry.update({ where: { id: entry.id }, data });
      }
      await audit(
        tx,
        c,
        reconcile ? 'RECONCILE' : 'UNRECONCILE',
        'bank',
        entryId ?? paymentId!,
        data.statementNumber,
      );
      return { ok: true };
    });
  }
}
