import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';
import type { Context } from '../common/context.js';
export type Tx = Prisma.TransactionClient;
export async function atomic<T>(db: PrismaService, work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let i = 0; i < 4; i++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: 'Serializable',
        timeout: 15000,
        maxWait: 5000,
      });
    } catch (e) {
      const error = e as { code?: string; name?: string; cause?: { kind?: string } };
      const adapterConflict =
        error?.name === 'DriverAdapterError' && error.cause?.kind === 'TransactionWriteConflict';
      if (error?.code !== 'P2034' && !adapterConflict) throw e;
    }
  }
  throw new ConflictException('数据正在被其他操作修改，请稍后重试');
}
export async function audit(
  tx: Tx,
  c: Context,
  action: string,
  resource: string,
  recordId: string,
  detail = '',
) {
  await tx.auditLog.create({
    data: {
      companyId: c.companyId,
      actorId: c.userId,
      actorName: c.name,
      action,
      resource,
      recordId,
      detail,
    },
  });
}
