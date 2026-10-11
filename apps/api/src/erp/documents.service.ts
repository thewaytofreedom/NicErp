import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { atomic, audit, type Tx } from '../database/transaction.js';
import {
  object,
  str,
  choice,
  id,
  dec,
  list,
  currency,
  date,
  bool,
  kinds,
  type Input,
  type Kind,
} from '../common/input.js';
import { permit, documentArea, type Context } from '../common/context.js';
import { owned } from './catalog.service.js';
import { equivalentProductIds, chooseImportProduct } from './product-matching.js';
import { sectionTotals } from './sections.js';
import { kitParts } from './kits.js';
const D = Prisma.Decimal;
export function orderQuoteLines<T extends object>(values: T[]) {
  const positions = new Set<number>();
  const lines = values.map((line, index) => {
    const value = object(line).position ?? index;
    if (!['number', 'string'].includes(typeof value) || !/^\d{1,6}$/.test(String(value)))
      throw new BadRequestException('明细序号必须为 1 至 1000000 的整数');
    const position = Number(value);
    if (positions.has(position)) throw new BadRequestException(`明细序号 ${position + 1} 重复`);
    positions.add(position);
    return { ...line, position };
  });
  return lines.sort((a, b) => a.position - b.position);
}
const fingerprint = (b: unknown) => createHash('sha256').update(JSON.stringify(b)).digest('hex');
const includeDoc = {
  partner: true,
  lines: { orderBy: { position: 'asc' as const } },
  payments: { include: { account: true } },
  children: { select: { id: true, number: true, kind: true, status: true } },
  source: { select: { id: true, number: true } },
  operations: {
    include: { warehouse: true, movements: { include: { product: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
};
export function calculateLine(
  q: Prisma.Decimal,
  p: Prisma.Decimal,
  discount: Prisma.Decimal,
  globalDiscount: Prisma.Decimal,
  taxRate: Prisma.Decimal,
) {
  const net = q
    .mul(p)
    .mul(new D(1).minus(discount.div(100)))
    .mul(new D(1).minus(globalDiscount.div(100)))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const tax = net.mul(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { net, tax, total: net.plus(tax) };
}
@Injectable()
export class DocumentsService {
  constructor(private db: PrismaService) {}
  private async supplierCost(
    tx: Tx,
    companyId: string,
    productId: string,
    partnerId: string,
    quantity: Prisma.Decimal,
    at: Date,
  ) {
    const quotes = await tx.supplierPrice.findMany({
      where: {
        companyId,
        productId,
        partnerId,
        active: true,
        minQuantity: { lte: quantity },
        OR: [{ validUntil: null }, { validUntil: { gte: at } }],
      },
      orderBy: { minQuantity: 'desc' },
    });
    const tiers = new Map<string, (typeof quotes)[number]>();
    for (const quote of quotes) if (!tiers.has(quote.currency)) tiers.set(quote.currency, quote);
    return [...tiers.values()]
      .map((quote) => ({
        quote,
        cost: quote.unitPrice
          .mul(new D(1).minus(quote.discountRate.div(100)))
          .mul(quote.exchangeRate),
      }))
      .sort((a, b) => a.cost.comparedTo(b.cost))[0];
  }
  async purchasePrice(c: Context, raw: unknown) {
    const b = object(raw),
      kind = choice(b, 'kind', ['PURCHASE', 'BILL']);
    permit(c, documentArea(kind));
    const productId = id(b, 'productId')!,
      partnerId = id(b, 'partnerId')!,
      quantity = dec(b, 'quantity', '1', '0.0001', '100000000');
    const cur = currency(b),
      rate = dec(b, 'exchangeRate', '1', '0.000001', '999999', 6),
      at = date(b, 'date')!;
    return atomic(this.db, async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: c.companyId } });
      if (cur === company.currency && !rate.eq(1))
        throw new BadRequestException('本位币汇率必须为 1');
      await owned(
        await tx.partner.findFirst({
          where: {
            id: partnerId,
            companyId: c.companyId,
            type: { in: ['SUPPLIER', 'BOTH'] },
            active: true,
          },
        }),
      );
      const product = await owned(
        await tx.product.findFirst({
          where: { id: productId, companyId: c.companyId, active: true, purchaseEnabled: true },
        }),
      );
      const best = await this.supplierCost(tx, c.companyId, productId, partnerId, quantity, at);
      return {
        unitPrice: (best?.cost ?? product.costPrice).div(rate).toDecimalPlaces(4).toString(),
        supplierSku: best?.quote.supplierSku ?? '',
        source: best ? 'SUPPLIER' : 'REFERENCE',
        leadDays: best?.quote.leadDays ?? 0,
      };
    });
  }
  async transformLines(c: Context, raw: unknown) {
    const b = object(raw),
      kind = choice(b, 'kind', kinds),
      mode = choice(b, 'mode', ['DISCOUNT', 'PRICE', 'DELETE']),
      percent = dec(b, 'percent', '0', '0', '100');
    permit(c, documentArea(kind));
    const lines = list(b, 'lines', 200).map(object),
      indexes = list(b, 'indexes', 200);
    if (
      !indexes.length ||
      indexes.some(
        (i) => typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= lines.length,
      )
    )
      throw new BadRequestException('请选择有效的明细行');
    const selected = new Set(indexes);
    return {
      lines: lines.flatMap((line, i) => {
        if (!selected.has(i)) return [line];
        if (mode === 'DELETE') return [];
        if (line.kind !== 'ITEM') return [line];
        return [
          {
            ...line,
            ...(mode === 'DISCOUNT'
              ? { discountRate: percent.toString() }
              : {
                  unitPrice: dec(line, 'unitPrice')
                    .mul(new D(1).minus(percent.div(100)))
                    .toDecimalPlaces(4)
                    .toString(),
                }),
          },
        ];
      }),
    };
  }
  async importLines(c: Context, raw: unknown) {
    const b = object(raw),
      kind = choice(b, 'kind', kinds),
      preference = choice(b, 'preference', ['UNIQUE', '1', '2', '3', '4', '5', '6', '7'], 'UNIQUE');
    permit(c, documentArea(kind));
    const company = await this.db.company.findUniqueOrThrow({ where: { id: c.companyId } });
    const cur = currency(b, 'currency', company.currency),
      rate = dec(b, 'exchangeRate', '1', '0.000001', '999999', 6);
    if (cur === company.currency && !rate.eq(1))
      throw new BadRequestException('本位币单据的汇率必须为 1');
    const rows = list(b, 'rows', 200);
    if (!rows.length) throw new BadRequestException('至少需要一行导入资料');
    if (kind !== 'QUOTE' && !['UNIQUE', '7'].includes(preference))
      throw new BadRequestException('货源偏好仅适用于报价单');
    const lines = [];
    const warnings: { row: number; message: string }[] = [];
    for (const [index, rawRow] of rows.entries()) {
      const row = object(rawRow),
        number = str(row, 'number', 200).trim().toUpperCase(),
        description = str(row, 'description', 1800, ''),
        quantity = dec(row, 'quantity', '1', '0.0001', '100000000');
      const ids =
        preference === '7' ? undefined : await equivalentProductIds(this.db, c.companyId, number);
      const purchasing = ['PURCHASE', 'BILL'].includes(kind);
      const candidates = await this.db.product.findMany({
        where: {
          companyId: c.companyId,
          active: true,
          ...(purchasing ? { purchaseEnabled: true } : { saleEnabled: true }),
          ...(ids ? { id: { in: ids } } : { sku: { equals: number, mode: 'insensitive' } }),
        },
      });
      if (preference === 'UNIQUE' && candidates.length > 1)
        throw new BadRequestException(
          `第 ${index + 2} 行编号匹配多个产品，请使用直接产品编号模式或货源偏好`,
        );
      const p =
        preference === 'UNIQUE' ? candidates[0] : chooseImportProduct(candidates, preference);
      const manualPrice = row.unitPrice !== '' && row.unitPrice !== undefined;
      const unitPrice = manualPrice
        ? dec(row, 'unitPrice')
        : p
          ? (purchasing ? p.costPrice : p.salePrice).div(rate).toDecimalPlaces(4)
          : new D(0);
      if (!p)
        warnings.push({
          row: index + 2,
          message: candidates.length
            ? '货源不符合偏好，保留为自由明细'
            : '编号未匹配有效产品，保留为自由明细',
        });
      lines.push({
        kind: 'ITEM',
        ...(kind === 'QUOTE' ? { position: row.position ?? index } : {}),
        productId: p?.id ?? null,
        freeText: !p,
        description: p
          ? description || `${p.sku} · ${p.name}`
          : `${number} · ${description || '未匹配产品'}${candidates.length ? ' · 价格过期 / 货源不符' : ''}`,
        quantity: quantity.toString(),
        unitPrice: unitPrice.toString(),
        discountRate: dec(row, 'discountRate', '0', '0', '100').toString(),
        taxRate: dec(row, 'taxRate', p?.taxRate.toString() ?? '0', '0', '100').toString(),
      });
    }
    return { lines: kind === 'QUOTE' ? orderQuoteLines(lines) : lines, warnings };
  }
  async read(c: Context, query: Record<string, string | undefined>) {
    const kind = query.kind ? choice(query, 'kind', kinds) : undefined,
      status = query.status
        ? choice(query, 'status', ['DRAFT', 'CONFIRMED', 'PARTIAL', 'FULFILLED', 'VOID'] as const)
        : undefined;
    const page = Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1))),
      q = (query.q ?? '').slice(0, 200),
      contains = { contains: q, mode: 'insensitive' as const };
    const where = {
      companyId: c.companyId,
      kind,
      status,
      OR: [{ number: contains }, { partner: { name: contains } }],
    };
    return {
      rows: await this.db.document.findMany({
        where,
        include: { partner: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 25,
        take: 25,
      }),
      total: await this.db.document.count({ where }),
      page,
    };
  }
  async detail(c: Context, docId: string) {
    id({ docId }, 'docId');
    return owned(
      await this.db.document.findFirst({
        where: { id: docId, companyId: c.companyId },
        include: includeDoc,
      }),
    );
  }
  private async lines(
    tx: Tx,
    c: Context,
    raw: unknown[],
    globalDiscount: Prisma.Decimal,
    documentKind: Kind,
  ) {
    if (!raw.length) throw new BadRequestException('单据至少包含一条明细');
    let subtotal = new D(0),
      taxTotal = new D(0),
      group = new D(0),
      items = 0;
    const lines = [];
    const ordered = documentKind === 'QUOTE' ? orderQuoteLines(raw.map(object)) : raw.map(object);
    for (const [index, entry] of ordered.entries()) {
      const b = object(entry),
        position = documentKind === 'QUOTE' ? Number(b.position) : index,
        kind = choice(b, 'kind', ['ITEM', 'NOTE', 'TITLE', 'SUBTOTAL'], 'ITEM'),
        level = Number(dec(b, 'level', '1', '1', '9', 0).toString()),
        hidden = bool(b, 'hidden');
      if (kind !== 'ITEM') {
        lines.push({
          position,
          kind,
          level,
          hidden,
          description: str(b, 'description', 2000, kind === 'SUBTOTAL' ? '小计' : ''),
          productId: null,
          quantity: new D(0),
          unitPrice: new D(0),
          unitCost: new D(0),
          discountRate: new D(0),
          taxRate: new D(0),
          net: kind === 'SUBTOTAL' ? group : new D(0),
          tax: new D(0),
          total: kind === 'SUBTOTAL' ? group : new D(0),
          stockParts: [],
        });
        if (kind === 'SUBTOTAL') group = new D(0);
        continue;
      }
      const productId = id(b, 'productId', true) ?? null,
        product = productId
          ? await owned(
              await tx.product.findFirst({
                where: { id: productId, companyId: c.companyId, active: true },
                include: { components: { include: { product: true } } },
              }),
            )
          : null;
      if (!product && b.freeText !== true)
        throw new BadRequestException('请匹配产品或明确指定自由明细');
      if (
        product &&
        !(['PURCHASE', 'BILL'].includes(documentKind)
          ? product.purchaseEnabled
          : product.saleEnabled)
      )
        throw new BadRequestException('产品未启用对应的销售或采购用途');
      const quantity = dec(b, 'quantity', '1', '0.0001', '100000000'),
        unitPrice = dec(b, 'unitPrice'),
        discountRate = dec(b, 'discountRate', '0', '0', '100'),
        taxRate = dec(b, 'taxRate', product?.taxRate.toString() ?? '0', '0', '100');
      const amounts = calculateLine(quantity, unitPrice, discountRate, globalDiscount, taxRate);
      if (amounts.total.gt('999999999999')) throw new BadRequestException('明细金额过大');
      const expanded = product?.type === 'KIT' ? await kitParts(tx, c.companyId, product.id) : [];
      const stockParts =
        !product || product.type === 'SERVICE'
          ? []
          : product.type === 'KIT'
            ? expanded.map((p) => ({
                productId: p.productId,
                quantity: p.quantity.toString(),
              }))
            : [{ productId, quantity: '1' }];
      if (
        product?.type === 'KIT' &&
        (!stockParts.length || product.components.some((p) => !p.product.active))
      )
        throw new BadRequestException('组合产品的组成零件无效');
      const unitCost =
        product?.type === 'KIT'
          ? expanded.reduce((sum, p) => sum.plus(p.quantity.mul(p.cost)), new D(0))
          : (product?.costPrice ?? new D(0));
      lines.push({
        position,
        kind,
        level,
        hidden,
        description: str(
          b,
          'description',
          2000,
          product ? `${product.sku} · ${product.name}` : undefined,
        ),
        productId,
        freeText: !product,
        quantity,
        unitPrice,
        unitCost,
        discountRate,
        taxRate,
        ...amounts,
        stockParts,
      });
      subtotal = subtotal.plus(amounts.net);
      taxTotal = taxTotal.plus(amounts.tax);
      group = group.plus(amounts.net);
      items++;
    }
    if (!items) throw new BadRequestException('单据至少包含一个产品或服务');
    if (subtotal.plus(taxTotal).gt('99999999999999')) throw new BadRequestException('单据总额过大');
    return { lines: sectionTotals(lines), subtotal, taxTotal, total: subtotal.plus(taxTotal) };
  }
  private async nextNumber(tx: Tx, c: Context, kind: Kind) {
    const counter = await tx.counter.upsert({
      where: { companyId_kind: { companyId: c.companyId, kind } },
      create: { companyId: c.companyId, kind, value: 1 },
      update: { value: { increment: 1 } },
    });
    const prefix = { QUOTE: 'QT', SALE: 'SO', PURCHASE: 'PO', INVOICE: 'INV', BILL: 'BILL' };
    return `${prefix[kind]}-${String(counter.value).padStart(6, '0')}`;
  }
  async save(c: Context, raw: unknown, docId?: string) {
    const b = object(raw),
      kind = choice(b, 'kind', kinds);
    permit(c, documentArea(kind));
    return atomic(this.db, async (tx) => {
      const old = docId
        ? await owned(await tx.document.findFirst({ where: { id: docId, companyId: c.companyId } }))
        : null;
      if (old && (old.status !== 'DRAFT' || old.kind !== kind))
        throw new ConflictException('只能编辑同类型的草稿单据');
      if (old && old.version !== Number(b.version))
        throw new ConflictException('单据已被修改，请刷新后重试');
      const company = await tx.company.findUniqueOrThrow({ where: { id: c.companyId } }),
        partnerId = id(b, 'partnerId')!,
        partner = await owned(
          await tx.partner.findFirst({
            where: { id: partnerId, companyId: c.companyId, active: true },
          }),
        );
      if (
        ![['PURCHASE', 'BILL'].includes(kind) ? 'SUPPLIER' : 'CUSTOMER', 'BOTH'].includes(
          partner.type,
        )
      )
        throw new BadRequestException('往来单位类型与单据不符');
      const cur = currency(b, 'currency', company.currency),
        exchangeRate = dec(b, 'exchangeRate', '1', '0.000001', '999999', 6);
      if (cur === company.currency && !exchangeRate.eq(1))
        throw new BadRequestException('本位币单据的汇率必须为 1');
      const discountRate = dec(b, 'discountRate', '0', '0', '100'),
        amounts = await this.lines(tx, c, list(b, 'lines', 200), discountRate, kind);
      const documentDate = date(b, 'date')!,
        dueDate = date(b, 'dueDate', true) ?? null;
      if (dueDate && dueDate < documentDate)
        throw new BadRequestException('到期日不能早于单据日期');
      const defaultValidity = new Date(documentDate);
      defaultValidity.setUTCDate(defaultValidity.getUTCDate() + 15);
      const validUntil = kind === 'QUOTE' ? (date(b, 'validUntil', true) ?? defaultValidity) : null;
      const deliveryDate = date(b, 'deliveryDate', true) ?? null;
      if (validUntil && validUntil < documentDate)
        throw new BadRequestException('报价有效期不能早于单据日期');
      const data = {
        partnerId,
        partnerSnapshot: {
          name: partner.name,
          address: partner.address,
          taxNumber: partner.taxNumber,
          contact: partner.contact,
          email: partner.email,
        },
        currency: cur,
        exchangeRate,
        discountRate,
        subtotal: amounts.subtotal,
        taxTotal: amounts.taxTotal,
        total: amounts.total,
        date: documentDate,
        dueDate,
        validUntil,
        deliveryDate,
        customerReference: str(b, 'customerReference', 200, ''),
        paymentTerms: str(b, 'paymentTerms', 200, ''),
        paymentMethod: str(b, 'paymentMethod', 100, ''),
        shippingMethod: str(b, 'shippingMethod', 100, ''),
        incotermLocation: str(b, 'incotermLocation', 200, ''),
        privateNotes: str(b, 'privateNotes', 10000, ''),
        incoterm: str(b, 'incoterm', 100, ''),
        notes: str(b, 'notes', 10000, ''),
      };
      let doc;
      if (old) {
        await tx.documentLine.deleteMany({ where: { documentId: old.id } });
        doc = await tx.document.update({
          where: { id: old.id },
          data: { ...data, version: { increment: 1 }, lines: { create: amounts.lines } },
        });
      } else
        doc = await tx.document.create({
          data: {
            ...data,
            kind,
            companyId: c.companyId,
            number: await this.nextNumber(tx, c, kind),
            lines: { create: amounts.lines },
          },
        });
      await audit(tx, c, old ? 'UPDATE' : 'CREATE', 'documents', doc.id, doc.number);
      return doc;
    });
  }
  async clone(c: Context, docId: string) {
    const doc = await this.detail(c, docId);
    return this.save(c, {
      ...doc,
      exchangeRate: doc.exchangeRate.toString(),
      discountRate: doc.discountRate.toString(),
      date: new Date().toISOString().slice(0, 10),
      dueDate: '',
      validUntil: '',
      deliveryDate: '',
      lines: doc.lines.map((l) => ({
        ...l,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toString(),
        discountRate: l.discountRate.toString(),
        taxRate: l.taxRate.toString(),
      })),
    });
  }
  async transition(c: Context, docId: string, action: string, raw: unknown = {}) {
    return atomic(this.db, async (tx) => {
      const doc = await owned(
        await tx.document.findFirst({
          where: { id: docId, companyId: c.companyId },
          include: { lines: true, children: true },
        }),
      );
      permit(c, documentArea(doc.kind));
      if (action === 'accept' || action === 'reject') {
        if (doc.kind !== 'QUOTE' || doc.status !== 'CONFIRMED' || doc.quoteDecision !== 'PENDING')
          throw new ConflictException('只能接受或拒绝已确认且待回复的报价');
        const result = await tx.document.update({
          where: { id: doc.id },
          data: {
            quoteDecision: action === 'accept' ? 'ACCEPTED' : 'REFUSED',
            decisionReason: str(object(raw), 'reason', 1000, ''),
            version: { increment: 1 },
          },
        });
        await audit(tx, c, action.toUpperCase(), 'documents', doc.id, doc.number);
        return result;
      }
      if (action === 'reopen') {
        if (
          doc.status === 'DRAFT' ||
          doc.status === 'VOID' ||
          doc.lines.some((l) => l.fulfilled.gt(0)) ||
          doc.paidAmount.gt(0) ||
          doc.children.some((d) => d.status !== 'VOID')
        )
          throw new ConflictException('存在履约、付款或有效下游单据时不能返回草稿');
        const result = await tx.document.update({
          where: { id: doc.id },
          data: {
            status: 'DRAFT',
            quoteDecision: 'PENDING',
            decisionReason: '',
            version: { increment: 1 },
          },
        });
        await audit(tx, c, 'REOPEN', 'documents', doc.id, doc.number);
        return result;
      }
      if (action === 'delete') {
        if (
          doc.status !== 'DRAFT' ||
          doc.children.length ||
          doc.lines.some((l) => l.fulfilled.gt(0)) ||
          doc.paidAmount.gt(0)
        )
          throw new ConflictException('只能删除没有关联业务的草稿');
        if (
          (await tx.stockOperation.count({ where: { documentId: doc.id } })) ||
          (await tx.payment.count({ where: { documentId: doc.id } }))
        )
          throw new ConflictException('已有历史流水的单据不能删除');
        await tx.document.delete({ where: { id: doc.id } });
        await audit(tx, c, 'DELETE', 'documents', doc.id, doc.number);
        return { id: doc.id };
      }
      if (action === 'confirm') {
        if (doc.status !== 'DRAFT') throw new ConflictException('只能确认草稿单据');
        if (doc.sourceId) {
          const source = await tx.document.findUniqueOrThrow({ where: { id: doc.sourceId } });
          if (['DRAFT', 'VOID'].includes(source.status))
            throw new ConflictException('来源单据尚未生效');
        }
        if (!doc.lines.some((l) => l.kind === 'ITEM'))
          throw new BadRequestException('单据没有产品明细');
      } else if (action === 'void') {
        if (doc.status === 'VOID') return doc;
        if (
          doc.lines.some((l) => l.fulfilled.gt(0)) ||
          doc.paidAmount.gt(0) ||
          doc.children.some((d) => d.status !== 'VOID')
        )
          throw new ConflictException('请先退回已履约数量、冲销付款并作废关联下游单据');
      } else throw new BadRequestException('不支持的状态操作');
      const result = await tx.document.update({
        where: { id: doc.id },
        data: { status: action === 'confirm' ? 'CONFIRMED' : 'VOID', version: { increment: 1 } },
      });
      await audit(tx, c, action.toUpperCase(), 'documents', doc.id, doc.number);
      return result;
    });
  }
  async convert(c: Context, docId: string, raw: unknown) {
    const b = object(raw),
      target = choice(b, 'kind', kinds);
    permit(c, documentArea(target));
    return atomic(this.db, async (tx) => {
      const doc = await owned(
        await tx.document.findFirst({
          where: { id: docId, companyId: c.companyId },
          include: { lines: { orderBy: { position: 'asc' } } },
        }),
      );
      permit(c, documentArea(doc.kind));
      if (
        !(
          { QUOTE: ['SALE'], SALE: ['INVOICE', 'PURCHASE'], PURCHASE: ['BILL'] } as Record<
            string,
            string[]
          >
        )[doc.kind]?.includes(target)
      )
        throw new BadRequestException('不支持此单据转换');
      if (['DRAFT', 'VOID'].includes(doc.status)) throw new ConflictException('请先确认来源单据');
      if (doc.kind === 'QUOTE' && doc.quoteDecision === 'REFUSED')
        throw new ConflictException('已拒绝的报价不能转换');
      const existing = await tx.document.findFirst({
        where: { companyId: c.companyId, sourceId: doc.id, kind: target, status: { not: 'VOID' } },
      });
      if (existing) return existing;
      let partnerId = doc.partnerId,
        partnerSnapshot = doc.partnerSnapshot as Prisma.InputJsonValue;
      if (target === 'PURCHASE') {
        partnerId = id(b, 'partnerId')!;
        const partner = await owned(
          await tx.partner.findFirst({
            where: {
              id: partnerId,
              companyId: c.companyId,
              active: true,
              type: { in: ['SUPPLIER', 'BOTH'] },
            },
          }),
        );
        partnerSnapshot = {
          name: partner.name,
          address: partner.address,
          taxNumber: partner.taxNumber,
          contact: partner.contact,
          email: partner.email,
        };
      }
      const lines = doc.lines.map(
        ({ id: _, documentId: __, fulfilled: ___, stockParts, ...l }) => ({
          ...l,
          stockParts: stockParts as Prisma.InputJsonValue,
        }),
      );
      // Order-to-purchase creates a draft at base-currency reference cost; never copy a customer selling price as supplier cost.
      let subtotal = doc.subtotal,
        taxTotal = doc.taxTotal,
        total = doc.total,
        cur = doc.currency,
        exchangeRate = doc.exchangeRate,
        discountRate = doc.discountRate;
      if (target === 'PURCHASE') {
        cur = (await tx.company.findUniqueOrThrow({ where: { id: c.companyId } })).currency;
        exchangeRate = new D(1);
        discountRate = new D(0);
        subtotal = new D(0);
        taxTotal = new D(0);
        let group = new D(0);
        for (const l of lines) {
          if (l.kind === 'ITEM') {
            const quote = l.productId
              ? await this.supplierCost(
                  tx,
                  c.companyId,
                  l.productId,
                  partnerId,
                  l.quantity,
                  new Date(),
                )
              : undefined;
            l.unitPrice = quote?.cost.toDecimalPlaces(4) ?? l.unitCost;
            l.discountRate = new D(0);
            Object.assign(l, calculateLine(l.quantity, l.unitPrice, new D(0), new D(0), l.taxRate));
            subtotal = subtotal.plus(l.net);
            taxTotal = taxTotal.plus(l.tax);
            group = group.plus(l.net);
          } else if (l.kind === 'SUBTOTAL') {
            l.net = group;
            l.total = group;
            group = new D(0);
          }
        }
        total = subtotal.plus(taxTotal);
      }
      const result = await tx.document.create({
        data: {
          companyId: c.companyId,
          kind: target,
          number: await this.nextNumber(tx, c, target),
          partnerId,
          partnerSnapshot,
          sourceId: doc.id,
          currency: cur,
          exchangeRate,
          discountRate,
          subtotal,
          taxTotal,
          total,
          date: new Date(),
          incoterm: doc.incoterm,
          deliveryDate: doc.deliveryDate,
          customerReference: doc.customerReference,
          paymentTerms: doc.paymentTerms,
          paymentMethod: doc.paymentMethod,
          shippingMethod: doc.shippingMethod,
          incotermLocation: doc.incotermLocation,
          privateNotes: doc.privateNotes,
          notes: doc.notes,
          lines: { create: sectionTotals(lines) },
        },
      });
      await audit(tx, c, 'CONVERT', 'documents', result.id, `${doc.number} → ${result.number}`);
      return result;
    });
  }
  private async move(
    tx: Tx,
    operationId: string,
    warehouseId: string,
    productId: string,
    quantity: Prisma.Decimal,
  ) {
    const key = { warehouseId_productId: { warehouseId, productId } };
    const stock = await tx.stockBalance.findUnique({ where: key });
    const after = (stock?.quantity ?? new D(0)).plus(quantity);
    if (after.lt(0)) throw new ConflictException('库存不足，操作已全部回滚');
    await tx.stockBalance.upsert({
      where: key,
      create: { warehouseId, productId, quantity: after },
      update: { quantity: after },
    });
    await tx.stockMovement.create({
      data: { operationId, productId, quantity, balanceAfter: after },
    });
  }
  async adjust(c: Context, raw: unknown) {
    permit(c, 'inventory');
    const b = object(raw),
      warehouseId = id(b, 'warehouseId')!,
      productId = id(b, 'productId')!,
      quantity = dec(b, 'quantity', '0', '-100000000', '100000000'),
      note = str(b, 'note', 1000),
      requestKey = str(b, 'requestKey', 100);
    if (quantity.isZero()) throw new BadRequestException('调整数量不能为零');
    const fp = fingerprint({ warehouseId, productId, quantity: quantity.toString(), note });
    return atomic(this.db, async (tx) => {
      const previous = await tx.stockOperation.findUnique({
        where: { companyId_requestKey: { companyId: c.companyId, requestKey } },
      });
      if (previous) {
        if (previous.fingerprint !== fp) throw new ConflictException('重复请求的内容不一致');
        return previous;
      }
      await owned(
        await tx.warehouse.findFirst({
          where: { id: warehouseId, companyId: c.companyId, active: true },
        }),
      );
      await owned(
        await tx.product.findFirst({
          where: { id: productId, companyId: c.companyId, type: 'STOCK', active: true },
        }),
      );
      const op = await tx.stockOperation.create({
        data: {
          companyId: c.companyId,
          warehouseId,
          requestKey,
          fingerprint: fp,
          lineQuantities: [],
          kind: 'ADJUSTMENT',
          note,
        },
      });
      await this.move(tx, op.id, warehouseId, productId, quantity);
      await audit(tx, c, 'ADJUST', 'inventory', op.id, note);
      return op;
    });
  }
  async transfer(c: Context, raw: unknown) {
    permit(c, 'inventory');
    const b = object(raw),
      warehouseId = id(b, 'warehouseId')!,
      targetWarehouseId = id(b, 'targetWarehouseId')!,
      productId = id(b, 'productId')!,
      quantity = dec(b, 'quantity', '1', '0.0001', '100000000'),
      note = str(b, 'note', 1000),
      key = str(b, 'requestKey', 90);
    if (warehouseId === targetWarehouseId) throw new BadRequestException('调出和调入仓库不能相同');
    const fp = fingerprint({
      warehouseId,
      targetWarehouseId,
      productId,
      quantity: quantity.toString(),
      note,
    });
    return atomic(this.db, async (tx) => {
      const previous = await tx.stockOperation.findUnique({
        where: { companyId_requestKey: { companyId: c.companyId, requestKey: key + ':out' } },
      });
      if (previous) {
        if (previous.fingerprint !== fp) throw new ConflictException('重复请求的内容不一致');
        return previous;
      }
      for (const warehouse of [warehouseId, targetWarehouseId])
        await owned(
          await tx.warehouse.findFirst({
            where: { id: warehouse, companyId: c.companyId, active: true },
          }),
        );
      await owned(
        await tx.product.findFirst({
          where: { id: productId, companyId: c.companyId, type: 'STOCK', active: true },
        }),
      );
      const out = await tx.stockOperation.create({
        data: {
          companyId: c.companyId,
          warehouseId,
          requestKey: key + ':out',
          fingerprint: fp,
          lineQuantities: [],
          kind: 'TRANSFER_OUT',
          note,
        },
      });
      const into = await tx.stockOperation.create({
        data: {
          companyId: c.companyId,
          warehouseId: targetWarehouseId,
          requestKey: key + ':in',
          fingerprint: fp,
          lineQuantities: [],
          kind: 'TRANSFER_IN',
          note,
        },
      });
      await this.move(tx, out.id, warehouseId, productId, quantity.negated());
      await this.move(tx, into.id, targetWarehouseId, productId, quantity);
      await audit(tx, c, 'TRANSFER', 'inventory', out.id, note);
      return out;
    });
  }
  async fulfill(c: Context, docId: string, raw: unknown) {
    permit(c, 'inventory');
    const b = object(raw),
      warehouseId = id(b, 'warehouseId')!,
      requestKey = str(b, 'requestKey', 100),
      action = choice(b, 'action', ['FULFILL', 'RETURN'], 'FULFILL');
    const requested = list(b, 'lines', 200)
      .map(object)
      .map((l) => ({
        lineId: id(l, 'lineId')!,
        quantity: dec(l, 'quantity', '1', '0.0001', '100000000').toString(),
      }));
    if (!requested.length || new Set(requested.map((l) => l.lineId)).size !== requested.length)
      throw new BadRequestException('请选择明细且不能重复');
    const fp = fingerprint({ docId, warehouseId, action, requested });
    return atomic(this.db, async (tx) => {
      const previous = await tx.stockOperation.findUnique({
        where: { companyId_requestKey: { companyId: c.companyId, requestKey } },
      });
      if (previous) {
        if (previous.fingerprint !== fp) throw new ConflictException('重复请求的内容不一致');
        return previous;
      }
      const doc = await owned(
        await tx.document.findFirst({
          where: { id: docId, companyId: c.companyId },
          include: { lines: true },
        }),
      );
      if (!['SALE', 'PURCHASE'].includes(doc.kind) || ['DRAFT', 'VOID'].includes(doc.status))
        throw new ConflictException('只能对已确认的销售或采购订单操作');
      await owned(
        await tx.warehouse.findFirst({
          where: { id: warehouseId, companyId: c.companyId, active: true },
        }),
      );
      const past =
        action === 'RETURN'
          ? await tx.stockOperation.findMany({ where: { documentId: doc.id, warehouseId } })
          : [];
      for (const request of requested) {
        const line = doc.lines.find((l) => l.id === request.lineId && l.kind === 'ITEM');
        if (!line) throw new BadRequestException('无效的履约明细');
        const qty = new D(request.quantity);
        if (action === 'FULFILL' && qty.gt(line.quantity.minus(line.fulfilled)))
          throw new ConflictException('数量超过尚未履约数量');
        if (action === 'RETURN') {
          let atWarehouse = new D(0);
          for (const op of past) {
            for (const entry of op.lineQuantities as { lineId: string; quantity: string }[]) {
              if (entry.lineId === line.id)
                atWarehouse = atWarehouse.plus(
                  new D(entry.quantity).mul(op.kind.endsWith('_RETURN') ? -1 : 1),
                );
            }
          }
          if (qty.gt(line.fulfilled) || qty.gt(atWarehouse))
            throw new ConflictException('退回数量超过该仓库已履约数量');
        }
      }
      const kind =
        (doc.kind === 'SALE' ? 'SHIPMENT' : 'RECEIPT') + (action === 'RETURN' ? '_RETURN' : '');
      const op = await tx.stockOperation.create({
        data: {
          companyId: c.companyId,
          warehouseId,
          documentId: doc.id,
          requestKey,
          fingerprint: fp,
          lineQuantities: requested,
          kind,
          note: str(b, 'note', 1000, ''),
        },
      });
      for (const request of requested) {
        const line = doc.lines.find((l) => l.id === request.lineId)!,
          qty = new D(request.quantity),
          sign = (doc.kind === 'SALE' ? -1 : 1) * (action === 'RETURN' ? -1 : 1);
        for (const part of line.stockParts as { productId: string; quantity: string }[]) {
          await this.move(tx, op.id, warehouseId, part.productId, qty.mul(part.quantity).mul(sign));
        }
        const fulfilled = line.fulfilled.plus(qty.mul(action === 'RETURN' ? -1 : 1));
        await tx.documentLine.update({ where: { id: line.id }, data: { fulfilled } });
        line.fulfilled = fulfilled;
      }
      const items = doc.lines.filter((l) => l.kind === 'ITEM'),
        status = items.every((l) => l.fulfilled.eq(l.quantity))
          ? 'FULFILLED'
          : items.some((l) => l.fulfilled.gt(0))
            ? 'PARTIAL'
            : 'CONFIRMED';
      await tx.document.update({
        where: { id: doc.id },
        data: { status, version: { increment: 1 } },
      });
      await audit(tx, c, kind, 'inventory', op.id, doc.number);
      return op;
    });
  }
  async pay(c: Context, docId: string, raw: unknown) {
    permit(c, 'finance');
    const b = object(raw),
      accountId = id(b, 'accountId')!,
      amount = dec(b, 'amount', '0', '0.01', '999999999999', 2),
      paymentDate = date(b, 'date')!,
      reference = str(b, 'reference', 200, ''),
      requestKey = c.companyId + ':' + str(b, 'requestKey', 100);
    const fp = fingerprint({
      docId,
      accountId,
      amount: amount.toString(),
      date: paymentDate.toISOString(),
      reference,
    });
    return atomic(this.db, async (tx) => {
      const previous = await tx.payment.findUnique({ where: { requestKey } });
      if (previous) {
        if (previous.fingerprint !== fp) throw new ConflictException('重复请求内容不一致');
        return previous;
      }
      const doc = await owned(
        await tx.document.findFirst({ where: { id: docId, companyId: c.companyId } }),
      );
      if (!['INVOICE', 'BILL'].includes(doc.kind) || doc.status !== 'CONFIRMED')
        throw new ConflictException('只能对已确认的发票收付款');
      if (amount.gt(doc.total.minus(doc.paidAmount)))
        throw new ConflictException('金额超过单据未付余额');
      const account = await owned(
        await tx.bankAccount.findFirst({
          where: { id: accountId, companyId: c.companyId, active: true },
        }),
      );
      if (account.currency !== doc.currency)
        throw new BadRequestException('账户与单据币种必须相同');
      if (paymentDate < doc.date) throw new BadRequestException('付款日期不能早于单据日期');
      const payment = await tx.payment.create({
        data: {
          documentId: doc.id,
          accountId,
          amount,
          date: paymentDate,
          reference,
          requestKey,
          fingerprint: fp,
          direction: doc.kind === 'INVOICE' ? 'IN' : 'OUT',
        },
      });
      await tx.document.update({
        where: { id: doc.id },
        data: { paidAmount: { increment: amount }, version: { increment: 1 } },
      });
      await audit(
        tx,
        c,
        'PAYMENT',
        'payments',
        payment.id,
        `${doc.number} ${amount} ${doc.currency}`,
      );
      return payment;
    });
  }
  async reversePayment(c: Context, paymentId: string) {
    permit(c, 'finance');
    return atomic(this.db, async (tx) => {
      const payment = await owned(
        await tx.payment.findFirst({
          where: { id: paymentId, document: { companyId: c.companyId } },
        }),
      );
      if (payment.reversedAt) return payment;
      if (payment.reconciledAt) throw new ConflictException('请先取消银行对账，再冲销付款');
      const result = await tx.payment.update({
        where: { id: paymentId },
        data: { reversedAt: new Date() },
      });
      await tx.document.update({
        where: { id: payment.documentId },
        data: { paidAmount: { decrement: payment.amount }, version: { increment: 1 } },
      });
      await audit(tx, c, 'REVERSE', 'payments', paymentId);
      return result;
    });
  }
}
