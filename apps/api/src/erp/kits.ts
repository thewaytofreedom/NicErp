import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { Tx } from '../database/transaction.js';

export async function kitParts(tx: Tx, companyId: string, productId: string) {
  const leaves = new Map<
    string,
    { productId: string; quantity: Prisma.Decimal; cost: Prisma.Decimal }
  >();
  async function walk(id: string, multiplier: Prisma.Decimal, path: Set<string>) {
    if (path.has(id) || path.size >= 64)
      throw new BadRequestException('组合产品存在循环或层级过深');
    const product = await tx.product.findFirst({
      where: { id, companyId, active: true },
      include: { components: true },
    });
    if (!product || product.type === 'SERVICE')
      throw new BadRequestException('组合组成必须是有效库存产品或组合产品');
    if (product.type === 'STOCK') {
      const old = leaves.get(id);
      leaves.set(id, {
        productId: id,
        quantity: multiplier.plus(old?.quantity ?? 0),
        cost: product.costPrice,
      });
      return;
    }
    if (!product.components.length) throw new BadRequestException('组合产品缺少组成零件');
    const next = new Set(path);
    next.add(id);
    for (const component of product.components)
      await walk(component.productId, multiplier.mul(component.quantity), next);
  }
  await walk(productId, new Prisma.Decimal(1), new Set());
  return [...leaves.values()];
}

export async function validateKitLinks(
  tx: Tx,
  companyId: string,
  kitId: string | undefined,
  parts: { productId: string }[],
) {
  async function walk(id: string, path: Set<string>) {
    if (id === kitId || path.has(id) || path.size >= 64)
      throw new BadRequestException('组合产品不能形成循环');
    const p = await tx.product.findFirst({
      where: { id, companyId, active: true, type: { in: ['STOCK', 'KIT'] } },
      include: { components: true },
    });
    if (!p) throw new BadRequestException('组成零件必须是本公司有效库存产品或组合产品');
    const next = new Set(path);
    next.add(id);
    for (const child of p.components) await walk(child.productId, next);
  }
  for (const part of parts) await walk(part.productId, new Set());
}
