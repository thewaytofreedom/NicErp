import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { atomic, audit, type Tx } from '../database/transaction.js';
import {
  object,
  str,
  choice,
  bool,
  id,
  dec,
  strings,
  list,
  email,
  currency,
  url,
  password,
  roles,
  date,
  type Input,
} from '../common/input.js';
import { canAccess, permit, type Context } from '../common/context.js';
import { hashPassword } from '../auth/auth.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { DocumentKind } from '../generated/prisma/enums.js';
import { equivalentProductIds } from './product-matching.js';
import { validateKitLinks, kitParts } from './kits.js';
export async function owned<T>(value: T | null): Promise<T> {
  if (!value) throw new NotFoundException('记录不存在或不属于当前公司');
  return value;
}
@Injectable()
export class CatalogService {
  constructor(private db: PrismaService) {}
  async bootstrap(c: Context) {
    const where = { companyId: c.companyId },
      partnerWhere = { ...where, ...(c.role === 'SALES' ? { createdById: c.userId } : {}) };
    const [company, products, partners, warehouses, accounts, lookups, exchangeRates] =
      await Promise.all([
        this.db.company.findUniqueOrThrow({ where: { id: c.companyId } }),
      this.db.product.findMany({
        where: { ...where, active: true },
        orderBy: { sku: 'asc' },
        take: 1000,
        include: { components: true },
      }),
      this.db.partner.findMany({
        where: { ...partnerWhere, active: true },
        orderBy: { name: 'asc' },
        take: 1000,
      }),
      (canAccess(c, 'inventory') || c.role === 'SALES') ? this.db.warehouse.findMany({
        where: { ...where, active: true },
        orderBy: { name: 'asc' },
        take: 1000,
        select: { id: true, name: true, code: true, type: true, active: true },
      }) : [],
      (canAccess(c, 'finance') || c.role === 'SALES') ? this.db.bankAccount.findMany({
        where: { ...where, active: true },
        orderBy: { name: 'asc' },
        take: 1000,
        select: { id: true, name: true, currency: true, type: true, active: true },
      }) : [],
        this.db.lookup.findMany({ where, orderBy: { name: 'asc' }, take: 1000 }),
        this.db.exchangeRate.findMany({
          where: { ...where, active: true },
          orderBy: { currency: 'asc' },
          take: 1000,
        }),
      ]);
    return {
      company,
      products: c.role === 'SALES'
        ? products.map(({ costPrice: _costPrice, ...product }) => product)
        : products,
      partners,
      warehouses,
      accounts,
      lookups,
      exchangeRates,
      role: c.role,
    };
  }
  async post(c: Context, recordId: string) {
    permit(c, 'content');
    id({ recordId }, 'recordId');
    return owned(await this.db.post.findFirst({ where: { id: recordId, companyId: c.companyId } }));
  }
  async partnerProfile(c: Context, partnerId: string) {
    id({ partnerId }, 'partnerId');
    return atomic(this.db, async (tx) => {
      const partner = await owned(
        await tx.partner.findFirst({
          where: {
            id: partnerId,
            companyId: c.companyId,
            ...(c.role === 'SALES' ? { createdById: c.userId } : {}),
          },
        }),
      );
      const company = await tx.company.findUniqueOrThrow({ where: { id: c.companyId } });
      const documents = await tx.document.findMany({
        where: {
          companyId: c.companyId,
          partnerId,
          ...(c.role === 'SALES' ? { kind: { in: ['QUOTE', 'SALE', 'INVOICE'] } } : {}),
        },
        orderBy: { date: 'desc' },
      });
      const invoices = documents.filter(
        (d) => ['INVOICE', 'BILL'].includes(d.kind) && !['DRAFT', 'VOID'].includes(d.status),
      );
      let totalInvoiced = new Prisma.Decimal(0),
        totalPaid = new Prisma.Decimal(0),
        receivable = new Prisma.Decimal(0),
        payable = new Prisma.Decimal(0);
      const rows = invoices.map((d) => {
        const total = d.total.mul(d.exchangeRate),
          paid = d.paidAmount.mul(d.exchangeRate),
          outstanding = total.minus(paid);
        totalInvoiced = totalInvoiced.plus(total);
        totalPaid = totalPaid.plus(paid);
        if (d.kind === 'INVOICE') receivable = receivable.plus(outstanding);
        else payable = payable.plus(outstanding);
        return {
          id: d.id,
          number: d.number,
          kind: d.kind,
          status: d.status,
          date: d.date,
          dueDate: d.dueDate,
          currency: d.currency,
          total: d.total.toString(),
          paidAmount: d.paidAmount.toString(),
          outstanding: outstanding.toString(),
        };
      });
      const operations = await tx.stockOperation.findMany({
        where: {
          companyId: c.companyId,
          document: { partnerId },
          kind: { in: ['SHIPMENT', 'SHIPMENT_RETURN', 'RECEIPT', 'RECEIPT_RETURN'] },
        },
        include: {
          warehouse: { select: { name: true } },
          document: { select: { id: true, number: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return {
        partner,
        documents: rows,
        quotes: documents
          .filter((d) => d.kind === 'QUOTE')
          .map((d) => ({
            id: d.id,
            number: d.number,
            status: d.status,
            date: d.date,
            validUntil: d.validUntil,
            currency: d.currency,
            total: d.total.toString(),
            quoteDecision: d.quoteDecision,
          })),
        orders: documents
          .filter((d) => ['SALE', 'PURCHASE'].includes(d.kind))
          .map((d) => ({
            id: d.id,
            number: d.number,
            kind: d.kind,
            status: d.status,
            date: d.date,
            currency: d.currency,
            total: d.total.toString(),
          })),
        shipments: operations.map((op) => ({
          id: op.id,
          kind: op.kind,
          createdAt: op.createdAt,
          warehouse: op.warehouse.name,
          documentId: op.document?.id ?? null,
          number: op.document?.number ?? '',
          quantity: (op.lineQuantities as { quantity: string }[])
            .reduce((sum, l) => sum.plus(l.quantity), new Prisma.Decimal(0))
            .toString(),
          note: op.note,
        })),
        summary: {
          baseCurrency: company.currency,
          totalInvoiced: totalInvoiced.toFixed(2),
          totalPaid: totalPaid.toFixed(2),
          receivable: receivable.toFixed(2),
          payable: payable.toFixed(2),
          outstanding: receivable.minus(payable).toFixed(2),
        },
      };
    });
  }
  async dashboard(c: Context) {
    const companyId = c.companyId,
      salesOnly = c.role === 'SALES',
      partnerScope = salesOnly ? { createdById: c.userId } : {};
    const [products, partners, documents, recent] = await Promise.all([
      this.db.product.count({ where: { companyId, active: true } }),
      this.db.partner.count({ where: { companyId, active: true, ...partnerScope } }),
      this.db.document.findMany({
        where: {
          companyId,
          status: { notIn: ['DRAFT', 'VOID'] },
          ...(salesOnly ? { kind: { in: ['QUOTE', 'SALE'] }, partner: partnerScope } : {}),
        },
        select: {
          kind: true,
          status: true,
          total: true,
          paidAmount: true,
          exchangeRate: true,
          lines: { select: { kind: true, net: true, quantity: true, unitCost: true } },
        },
      }),
      this.db.auditLog.findMany({
        where: { companyId, ...(salesOnly ? { actorId: c.userId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);
    let receivable = new Prisma.Decimal(0),
      payable = new Prisma.Decimal(0),
      sales = new Prisma.Decimal(0),
      margin = new Prisma.Decimal(0);
    for (const d of documents) {
      const outstanding = d.total.minus(d.paidAmount).mul(d.exchangeRate);
      if (d.kind === 'INVOICE') {
        receivable = receivable.plus(outstanding);
        for (const l of d.lines.filter((l) => l.kind === 'ITEM')) {
          sales = sales.plus(l.net.mul(d.exchangeRate));
          margin = margin.plus(l.net.mul(d.exchangeRate).minus(l.unitCost.mul(l.quantity)));
        }
      }
      if (d.kind === 'BILL') payable = payable.plus(outstanding);
    }
    return {
      products,
      partners,
      openOrders: documents.filter(
        (d) => ['SALE', 'PURCHASE'].includes(d.kind) && d.status !== 'FULFILLED',
      ).length,
      receivable: salesOnly ? null : receivable.toFixed(2),
      payable: salesOnly ? null : payable.toFixed(2),
      sales: salesOnly ? null : sales.toFixed(2),
      margin: salesOnly ? null : margin.toFixed(2),
      recent,
    };
  }
  async read(c: Context, resource: string, query: Record<string, string | undefined>) {
    const readAreas: Record<string, string> = {
      'supplier-prices': 'purchasing',
      warehouses: 'inventory',
      stock: 'inventory',
      'kit-stock': 'inventory',
      movements: 'inventory',
      shipments: 'inventory',
      receipts: 'inventory',
      'pending-shipments': 'inventory',
      accounts: 'finance',
      payments: 'finance',
      'bank-entries': 'finance',
      margins: 'finance',
      posts: 'content',
      users: 'settings',
      audit: 'settings',
      'exchange-rates': 'settings',
    };
    const salesScopedResource =
      c.role === 'SALES' && ['shipments', 'pending-shipments', 'payments'].includes(resource);
    if (readAreas[resource] && !salesScopedResource) permit(c, readAreas[resource]);
    const page = Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1))),
      take = 25,
      skip = (page - 1) * take,
      q = (query.q ?? '').trim().slice(0, 200),
      companyId = c.companyId;
    const contains = { contains: q, mode: 'insensitive' as const };
    switch (resource) {
      case 'margins': {
        const dimension = choice(query, 'group', ['product', 'partner', 'document'], 'product');
        const from = date(query, 'from', true),
          to = date(query, 'to', true);
        if (from && to && from > to) throw new BadRequestException('开始日期不能晚于结束日期');
        const groupId =
          dimension === 'partner'
            ? Prisma.sql`s.id::text`
            : dimension === 'document'
              ? Prisma.sql`d.id::text`
              : Prisma.sql`COALESCE(p.id::text,'FREE')`;
        const groupName =
          dimension === 'partner'
            ? Prisma.sql`s.name`
            : dimension === 'document'
              ? Prisma.sql`d.number`
              : Prisma.sql`COALESCE(p.sku || ' · ' || p.name,'自由明细')`;
        const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
        const grouped = Prisma.sql`SELECT ${groupId} AS id,${groupName} AS name,
          ROUND(SUM(l.net*d."exchangeRate"),2) AS revenue,ROUND(SUM(l.quantity*l."unitCost"),2) AS cost
          FROM document_lines l JOIN documents d ON d.id=l."documentId"
          JOIN partners s ON s.id=d."partnerId" LEFT JOIN products p ON p.id=l."productId"
          WHERE d."companyId"=${companyId}::uuid AND d.kind='INVOICE' AND d.status NOT IN ('DRAFT','VOID') AND l.kind='ITEM'
          AND (s.name ILIKE ${pattern} OR d.number ILIKE ${pattern} OR p.sku ILIKE ${pattern} OR p.name ILIKE ${pattern} OR l.description ILIKE ${pattern})
          ${from ? Prisma.sql`AND d.date >= ${from}` : Prisma.empty}
          ${to ? Prisma.sql`AND d.date <= ${to}` : Prisma.empty}
          GROUP BY 1,2`;
        const [rows, count] = await Promise.all([
          this.db.$queryRaw<
            { id: string; name: string; revenue: Prisma.Decimal; cost: Prisma.Decimal }[]
          >(
            Prisma.sql`SELECT * FROM (${grouped}) g ORDER BY revenue DESC,id LIMIT ${take} OFFSET ${skip}`,
          ),
          this.db.$queryRaw<{ total: number }[]>(
            Prisma.sql`SELECT COUNT(*)::integer AS total FROM (${grouped}) g`,
          ),
        ]);
        return {
          rows: rows.map((r) => ({
            ...r,
            currency: 'BASE',
            grossProfit: r.revenue.minus(r.cost).toFixed(2),
            marginRate: r.revenue.isZero()
              ? null
              : r.revenue.minus(r.cost).div(r.revenue).mul(100).toFixed(4),
            markupRate: r.cost.isZero()
              ? null
              : r.revenue.minus(r.cost).div(r.cost).mul(100).toFixed(4),
          })),
          total: count[0].total,
          page,
        };
      }
      case 'products': {
        const numberMatch = query.match === 'number';
        const exact = query.exact === '1';
        if (numberMatch && !q) return { rows: [], total: 0, page };
        const equivalentIds =
          numberMatch && exact ? await equivalentProductIds(this.db, companyId, q) : undefined;
        const where = {
          companyId,
          ...(numberMatch ? { active: true } : {}),
          ...(numberMatch && query.usage === 'sale' ? { saleEnabled: true } : {}),
          ...(numberMatch && query.usage === 'purchase' ? { purchaseEnabled: true } : {}),
          ...(numberMatch && query.usage === 'components'
            ? { type: { in: ['STOCK', 'KIT'] } }
            : {}),
          ...(equivalentIds ? { id: { in: equivalentIds } } : {}),
          OR: numberMatch
            ? equivalentIds
              ? undefined
              : [
                  { sku: exact ? { equals: q, mode: 'insensitive' as const } : contains },
                  { relatedNumbers: { has: q.toUpperCase() } },
                ]
            : [{ name: contains }, { sku: contains }, { relatedNumbers: { has: q.toUpperCase() } }],
        };
        const products = await this.db.product.findMany({
            where,
            include: { components: true },
            orderBy: { sku: 'asc' },
            skip,
            take,
          });
        return {
          rows: c.role === 'SALES'
            ? products.map(({ costPrice: _costPrice, ...product }) => product)
            : products,
          total: await this.db.product.count({ where }),
          page,
        };
      }
      case 'partners': {
        const where = {
          companyId,
          ...(c.role === 'SALES' ? { createdById: c.userId } : {}),
          OR: [{ name: contains }, { code: contains }, { contact: contains }],
        };
        return {
          rows: await this.db.partner.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
          total: await this.db.partner.count({ where }),
          page,
        };
      }
      case 'contacts': {
        const where = {
          partner: {
            companyId,
            ...(c.role === 'SALES' ? { createdById: c.userId } : {}),
          },
          ...(query.partnerId ? { partnerId: id(query, 'partnerId') } : {}),
          OR: [{ name: contains }, { email: contains }, { partner: { name: contains } }],
        };
        return {
          rows: await this.db.contact.findMany({
            where,
            include: { partner: true },
            orderBy: { name: 'asc' },
            skip,
            take,
          }),
          total: await this.db.contact.count({ where }),
          page,
        };
      }
      case 'supplier-prices': {
        const where = {
          companyId,
          ...(query.productId ? { productId: id(query, 'productId') } : {}),
          ...(query.partnerId ? { partnerId: id(query, 'partnerId') } : {}),
          OR: [
            { supplierSku: contains },
            { product: { sku: contains } },
            { product: { name: contains } },
            { partner: { name: contains } },
          ],
        };
        return {
          rows: await this.db.supplierPrice.findMany({
            where,
            include: { product: true, partner: true },
            orderBy: [{ product: { sku: 'asc' } }, { minQuantity: 'asc' }],
            skip,
            take,
          }),
          total: await this.db.supplierPrice.count({ where }),
          page,
        };
      }
      case 'lookups': {
        const where = { companyId, name: contains };
        return {
          rows: await this.db.lookup.findMany({ where, orderBy: { kind: 'asc' }, skip, take }),
          total: await this.db.lookup.count({ where }),
          page,
        };
      }
      case 'exchange-rates': {
        const where = { companyId, currency: contains };
        return {
          rows: await this.db.exchangeRate.findMany({
            where,
            orderBy: { currency: 'asc' },
            skip,
            take,
          }),
          total: await this.db.exchangeRate.count({ where }),
          page,
        };
      }
      case 'warehouses': {
        const where = { companyId, name: contains };
        return {
          rows: await this.db.warehouse.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
          total: await this.db.warehouse.count({ where }),
          page,
        };
      }
      case 'stock': {
        const where = {
          warehouse: { companyId },
          product: { OR: [{ name: contains }, { sku: contains }] },
        };
        return {
          rows: await this.db.stockBalance.findMany({
            where,
            include: { warehouse: true, product: true },
            orderBy: [{ warehouseId: 'asc' }, { productId: 'asc' }],
            skip,
            take,
          }),
          total: await this.db.stockBalance.count({ where }),
          page,
        };
      }
      case 'shipments':
      case 'receipts': {
        const where = {
          companyId,
          kind: {
            in:
              resource === 'shipments'
                ? ['SHIPMENT', 'SHIPMENT_RETURN']
                : ['RECEIPT', 'RECEIPT_RETURN'],
          },
          ...(c.role === 'SALES'
            ? { document: { kind: 'SALE' as const, partner: { createdById: c.userId } } }
            : {}),
          OR: [
            { number: contains },
            { note: contains },
            { warehouse: { name: contains } },
            { document: { number: contains } },
            { document: { partner: { name: contains } } },
          ],
        };
        return {
          rows: await this.db.stockOperation.findMany({
            where,
            include: {
              warehouse: true,
              document: {
                select: {
                  id: true,
                  number: true,
                  kind: true,
                  status: true,
                  currency: true,
                  partnerSnapshot: true,
                  shippingMethod: true,
                  incoterm: true,
                  incotermLocation: true,
                  customerReference: true,
                  lines: {
                    orderBy: { position: 'asc' },
                    select: {
                      id: true,
                      description: true,
                      quantity: true,
                      fulfilled: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take,
          }),
          total: await this.db.stockOperation.count({ where }),
          page,
        };
      }
      case 'pending-shipments': {
        const docKind: DocumentKind = query.kind === 'PURCHASE' ? 'PURCHASE' : 'SALE';
        const where: Prisma.DocumentWhereInput = {
          companyId,
          kind: docKind,
          status: { in: ['CONFIRMED', 'PARTIAL'] },
          lines: { some: { kind: 'ITEM' } },
          ...(c.role === 'SALES' ? { partner: { createdById: c.userId } } : {}),
          OR: [
            { number: contains },
            { partner: { name: contains } },
            { lines: { some: { description: contains } } },
          ],
        };
        const docs = await this.db.document.findMany({
          where,
          include: {
            partner: { select: { name: true } },
            lines: {
              where: { kind: 'ITEM' },
              orderBy: { position: 'asc' },
              select: { id: true, description: true, quantity: true, fulfilled: true },
            },
          },
          orderBy: { date: 'asc' },
          skip,
          take,
        });
        return {
          rows: docs.map((d) => {
            const remaining = d.lines.reduce(
              (sum, l) => sum.plus(l.quantity.minus(l.fulfilled)),
              new Prisma.Decimal(0),
            );
            return { ...d, partnerName: d.partner.name, remaining: remaining.toString() };
          }),
          total: await this.db.document.count({ where }),
          page,
        };
      }
      case 'movements': {
        const where = {
          operation: { companyId },
          product: { OR: [{ name: contains }, { sku: contains }] },
        };
        return {
          rows: await this.db.stockMovement.findMany({
            where,
            include: {
              product: true,
              warehouse: true,
              operation: { include: { warehouse: true, document: { select: { number: true } } } },
            },
            orderBy: { operation: { createdAt: 'desc' } },
            skip,
            take,
          }),
          total: await this.db.stockMovement.count({ where }),
          page,
        };
      }
      case 'kit-stock': {
        const where = {
          companyId,
          type: 'KIT',
          active: true,
          OR: [{ sku: contains }, { name: contains }],
        };
        const products = await this.db.product.findMany({
          where,
          orderBy: { sku: 'asc' },
          skip,
          take,
        });
        const rows = await atomic(this.db, async (tx) => {
          const warehouses = await tx.warehouse.findMany({
            where: { companyId, active: true },
            orderBy: { name: 'asc' },
          });
          const result = [];
          for (const p of products) {
            try {
              const parts = await kitParts(tx, companyId, p.id);
              const stocks = await tx.stockBalance.findMany({
                where: {
                  productId: { in: parts.map((x) => x.productId) },
                  warehouse: { companyId, active: true },
                },
              });
              let total = new Prisma.Decimal(0);
              const availability = warehouses.map((warehouse) => {
                const quantities = parts.map((part) =>
                  (
                    stocks.find(
                      (s) => s.warehouseId === warehouse.id && s.productId === part.productId,
                    )?.quantity ?? new Prisma.Decimal(0)
                  )
                    .div(part.quantity)
                    .floor(),
                );
                const available = Prisma.Decimal.max(0, Prisma.Decimal.min(...quantities));
                total = total.plus(available);
                return `${warehouse.name}: ${available.toString()}`;
              });
              result.push({
                id: p.id,
                sku: p.sku,
                name: p.name,
                quantity: total.toString(),
                availability: availability.join('；'),
                costPrice: parts
                  .reduce((sum, x) => sum.plus(x.quantity.mul(x.cost)), new Prisma.Decimal(0))
                  .toString(),
              });
            } catch (error) {
              if (!(error instanceof BadRequestException)) throw error;
              result.push({
                id: p.id,
                sku: p.sku,
                name: p.name,
                quantity: '0',
                availability: error.message,
                costPrice: '0',
              });
            }
          }
          return result;
        });
        return { rows, total: await this.db.product.count({ where }), page };
      }
      case 'accounts': {
        const where = { companyId, name: contains };
        const accounts = await this.db.bankAccount.findMany({
          where,
          include: {
            // 收付款会自动生成关联资金收支，余额只算一次：关联流水的收付款跳过，其余手工收付款仍计入。
            payments: {
              where: { reversedAt: null, bankEntry: null },
              select: { amount: true, direction: true },
            },
            entries: { where: { operation: { reversedAt: null } }, select: { amount: true } },
          },
          orderBy: { name: 'asc' },
          skip,
          take,
        });
        return {
          rows: accounts.map(({ payments, entries, ...a }) => ({
            ...a,
            balance: payments
              .reduce(
                (sum, p) => sum.plus(p.direction === 'IN' ? p.amount : p.amount.negated()),
                entries.reduce((sum, e) => sum.plus(e.amount), a.openingBalance),
              )
              .toFixed(2),
          })),
          total: await this.db.bankAccount.count({ where }),
          page,
        };
      }
      case 'bank-entries': {
        const where = {
          account: { companyId },
          OR: [{ reference: contains }, { note: contains }, { account: { name: contains } }],
        };
        return {
          rows: await this.db.bankEntry.findMany({
            where,
            include: { account: true, operation: true },
            orderBy: [{ date: 'desc' }, { id: 'asc' }],
            skip,
            take,
          }),
          total: await this.db.bankEntry.count({ where }),
          page,
        };
      }
      case 'payments': {
        const where = {
          document: {
            companyId,
            ...(c.role === 'SALES'
              ? { kind: 'INVOICE' as const, partner: { createdById: c.userId } }
              : {}),
          },
          reference: contains,
        };
        return {
          rows: await this.db.payment.findMany({
            where,
            include: { account: true, document: { select: { number: true, currency: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take,
          }),
          total: await this.db.payment.count({ where }),
          page,
        };
      }
      case 'posts': {
        const where = { companyId, title: contains };
        return {
          rows: await this.db.post.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take }),
          total: await this.db.post.count({ where }),
          page,
        };
      }
      case 'users': {
        permit(c, 'settings');
        const where = { companyId, user: { OR: [{ name: contains }, { email: contains }] } };
        return {
          rows: (
            await this.db.membership.findMany({
              where,
              include: { user: { select: { id: true, name: true, email: true, active: true } } },
              skip,
              take,
              orderBy: { userId: 'asc' },
            })
          ).map((m) => ({ ...m.user, role: m.role })),
          total: await this.db.membership.count({ where }),
          page,
        };
      }
      case 'audit': {
        permit(c, 'settings');
        const where = {
          companyId,
          OR: [{ actorName: contains }, { detail: contains }, { resource: contains }],
        };
        return {
          rows: await this.db.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take,
          }),
          total: await this.db.auditLog.count({ where }),
          page,
        };
      }
      default:
        throw new NotFoundException('未知的业务资源');
    }
  }
  async save(c: Context, resource: string, raw: unknown, recordId?: string) {
    const b = object(raw);
    if (recordId) id({ recordId }, 'recordId');
    const area: Record<string, string> = {
      products: 'catalog',
      lookups: 'catalog',
      partners: 'partners',
      contacts: 'partners',
      'supplier-prices': 'purchasing',
      'exchange-rates': 'settings',
      warehouses: 'inventory',
      accounts: 'finance',
      posts: 'content',
      company: 'settings',
      companies: 'settings',
      users: 'settings',
    };
    if (!area[resource]) throw new NotFoundException('未知的业务资源');
    permit(c, area[resource]);
    const hash =
      resource === 'users' && !recordId && b.password ? await hashPassword(password(b)) : undefined;
    return atomic(this.db, async (tx) => {
      let result: { id: string };
      const companyId = c.companyId;
      switch (resource) {
        case 'contacts': {
          const partnerId = id(b, 'partnerId')!;
          await owned(
            await tx.partner.findFirst({
              where: {
                id: partnerId,
                companyId,
                ...(c.role === 'SALES' ? { createdById: c.userId } : {}),
              },
            }),
          );
          const data = {
            partnerId,
            name: str(b, 'name'),
            role: str(b, 'role', 200, ''),
            email: email(b, 'email', true),
            phone: str(b, 'phone', 80, ''),
            address: str(b, 'address', 2000, ''),
            notes: str(b, 'notes', 5000, ''),
            active: bool(b, 'active', true),
          };
          if (recordId) {
            await owned(
              await tx.contact.findFirst({
                where: {
                  id: recordId,
                  partner: {
                    companyId,
                    ...(c.role === 'SALES' ? { createdById: c.userId } : {}),
                  },
                },
              }),
            );
            result = await tx.contact.update({ where: { id: recordId }, data });
          } else result = await tx.contact.create({ data });
          break;
        }
        case 'supplier-prices': {
          const partnerId = id(b, 'partnerId')!,
            productId = id(b, 'productId')!;
          await owned(
            await tx.partner.findFirst({
              where: { id: partnerId, companyId, type: { in: ['SUPPLIER', 'BOTH'] }, active: true },
            }),
          );
          await owned(
            await tx.product.findFirst({
              where: { id: productId, companyId, purchaseEnabled: true, active: true },
            }),
          );
          const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
          const cur = currency(b, 'currency', company.currency),
            rate = dec(b, 'exchangeRate', '1', '0.000001', '999999', 6);
          if (cur === company.currency && !rate.eq(1))
            throw new BadRequestException('本位币报价汇率必须为 1');
          const data = {
            partnerId,
            productId,
            currency: cur,
            exchangeRate: rate,
            supplierSku: str(b, 'supplierSku', 200, ''),
            unitPrice: dec(b, 'unitPrice'),
            minQuantity: dec(b, 'minQuantity', '1', '0.0001', '100000000'),
            discountRate: dec(b, 'discountRate', '0', '0', '100'),
            leadDays: Number(dec(b, 'leadDays', '0', '0', '3650', 0)),
            validUntil: date(b, 'validUntil', true) ?? null,
            active: bool(b, 'active', true),
          };
          if (recordId) {
            await owned(await tx.supplierPrice.findFirst({ where: { id: recordId, companyId } }));
            result = await tx.supplierPrice.update({ where: { id: recordId }, data });
          } else result = await tx.supplierPrice.create({ data: { ...data, companyId } });
          break;
        }
        case 'products': {
          const data = {
            sku: str(b, 'sku', 80).toUpperCase(),
            name: str(b, 'name'),
            type: choice(b, 'type', ['STOCK', 'SERVICE', 'KIT'], 'STOCK'),
            unit: str(b, 'unit', 20, '件'),
            brandId: id(b, 'brandId', true) ?? null,
            categoryId: id(b, 'categoryId', true) ?? null,
            seriesId: id(b, 'seriesId', true) ?? null,
            relatedNumbers: [
              ...new Set(
                strings(b, 'relatedNumbers')
                  .map((n) => n.trim().toUpperCase())
                  .filter(Boolean),
              ),
            ],
            model: str(b, 'model', 255, ''),
            countryOfOrigin: str(b, 'countryOfOrigin', 100, ''),
            sourceTag: str(b, 'sourceTag', 100, '').trim().toUpperCase(),
            saleEnabled: bool(b, 'saleEnabled', true),
            purchaseEnabled: bool(b, 'purchaseEnabled', true),
            salePrice: dec(b, 'salePrice'),
            costPrice: dec(b, 'costPrice'),
            weight: dec(b, 'weight', '0', '0', '100000000', 4),
            length: dec(b, 'length', '0', '0', '100000000', 2),
            width: dec(b, 'width', '0', '0', '100000000', 2),
            height: dec(b, 'height', '0', '0', '100000000', 2),
            moq: dec(b, 'moq', '1', '0.0001', '100000000', 4),
            taxRate: dec(b, 'taxRate', '0', '0', '100'),
            description: str(b, 'description', 20000, ''),
            imageUrls: strings(b, 'imageUrls', 20).map(url),
            published: bool(b, 'published'),
            active: bool(b, 'active', true),
          };
          for (const [key, kind] of [
            ['brandId', 'BRAND'],
            ['categoryId', 'CATEGORY'],
            ['seriesId', 'SERIES'],
          ] as const)
            if (
              data[key] &&
              !(await tx.lookup.findFirst({ where: { id: data[key]!, companyId, kind } }))
            )
              throw new BadRequestException('品牌、分类或系列无效');
          const parts = list(b, 'components', 100)
            .map(object)
            .map((p) => ({
              productId: id(p, 'productId')!,
              quantity: dec(p, 'quantity', '1', '0.0001', '1000000'),
            }));
          if (data.type === 'KIT' && !parts.length)
            throw new BadRequestException('组合产品至少需要一个组成零件');
          if (data.type !== 'KIT' && parts.length)
            throw new BadRequestException('只有组合产品可以设置组成零件');
          if (new Set(parts.map((p) => p.productId)).size !== parts.length)
            throw new BadRequestException('组成零件不能重复');
          await validateKitLinks(tx, companyId, recordId, parts);
          if (recordId) {
            const old = await owned(
              await tx.product.findFirst({ where: { id: recordId, companyId } }),
            );
            if (
              old.type !== data.type &&
              ((await tx.stockBalance.count({ where: { productId: recordId } })) ||
                (await tx.documentLine.count({ where: { productId: recordId } })) ||
                (await tx.productComponent.count({ where: { productId: recordId } })))
            )
              throw new ConflictException('已使用产品不能修改产品类型');
            await tx.productComponent.deleteMany({ where: { kitId: recordId } });
            result = await tx.product.update({
              where: { id: recordId },
              data: { ...data, components: { create: parts } },
            });
          } else
            result = await tx.product.create({
              data: { ...data, companyId, components: { create: parts } },
            });
          break;
        }
        case 'partners': {
          const type = choice(b, 'type', ['CUSTOMER', 'SUPPLIER', 'BOTH'], 'CUSTOMER');
          const data = {
            name: str(b, 'name'),
            type,
            contact: str(b, 'contact', 200, ''),
            email: email(b, 'email', true),
            phone: str(b, 'phone', 80, ''),
            address: str(b, 'address', 2000, ''),
            taxNumber: str(b, 'taxNumber', 100, ''),
            notes: str(b, 'notes', 5000, ''),
            active: bool(b, 'active', true),
          };
          if (recordId) {
            await owned(
              await tx.partner.findFirst({
                where: {
                  id: recordId,
                  companyId,
                  ...(c.role === 'SALES' ? { createdById: c.userId } : {}),
                },
              }),
            );
            result = await tx.partner.update({ where: { id: recordId }, data });
          } else {
            const counterKind = type === 'SUPPLIER' ? 'PARTNER_SUPPLIER' : 'PARTNER_CUSTOMER';
            let code = '';
            do {
              const counter = await tx.counter.upsert({
                where: { companyId_kind: { companyId, kind: counterKind } },
                create: { companyId, kind: counterKind, value: 1 },
                update: { value: { increment: 1 } },
              });
              code = `${type === 'SUPPLIER' ? 'SUP' : 'CUS'}-${String(counter.value).padStart(6, '0')}`;
            } while (await tx.partner.findUnique({ where: { companyId_code: { companyId, code } } }));
            result = await tx.partner.create({
              data: { ...data, code, companyId, createdById: c.userId },
            });
          }
          break;
        }
        case 'exchange-rates': {
          const data = {
            currency: currency(b, 'currency'),
            rate: dec(b, 'rate', '1', '0.000001', '999999', 6),
            active: bool(b, 'active', true),
          };
          const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
          if (data.currency === company.currency && !data.rate.eq(1))
            throw new BadRequestException('本位币汇率必须为 1');
          if (recordId) {
            const old = await owned(
              await tx.exchangeRate.findFirst({ where: { id: recordId, companyId } }),
            );
            if (
              old.currency !== data.currency &&
              (await tx.exchangeRate.findFirst({ where: { companyId, currency: data.currency } }))
            )
              throw new ConflictException('该币种汇率已存在');
            result = await tx.exchangeRate.update({ where: { id: recordId }, data });
          } else {
            if (await tx.exchangeRate.findFirst({ where: { companyId, currency: data.currency } }))
              throw new ConflictException('该币种汇率已存在');
            result = await tx.exchangeRate.create({ data: { ...data, companyId } });
          }
          break;
        }
        case 'lookups': {
          const data = {
            kind: choice(b, 'kind', [
              'BRAND',
              'CATEGORY',
              'SERIES',
              'INCOTERM',
              'PAYMENT_TERM',
              'PAYMENT_METHOD',
              'SHIPMENT_METHOD',
            ]),
            name: str(b, 'name'),
          };
          if (recordId) {
            const old = await owned(
              await tx.lookup.findFirst({ where: { id: recordId, companyId } }),
            );
            if (old.kind !== data.kind) throw new BadRequestException('不能修改资料类型');
            result = await tx.lookup.update({ where: { id: recordId }, data });
          } else result = await tx.lookup.create({ data: { ...data, companyId } });
          break;
        }
        case 'warehouses': {
          const data = {
            code: str(b, 'code', 80).toUpperCase(),
            name: str(b, 'name'),
            address: str(b, 'address', 2000, ''),
            type: choice(b, 'type', ['PHYSICAL', 'VIRTUAL'], 'PHYSICAL'),
            active: bool(b, 'active', true),
          };
          if (recordId) {
            await owned(await tx.warehouse.findFirst({ where: { id: recordId, companyId } }));
            if (
              !data.active &&
              (await tx.stockBalance.count({
                where: { warehouseId: recordId, quantity: { not: 0 } },
              }))
            )
              throw new ConflictException('仓库仍有库存，不能停用');
            result = await tx.warehouse.update({ where: { id: recordId }, data });
          } else result = await tx.warehouse.create({ data: { ...data, companyId } });
          break;
        }
        case 'accounts': {
          const data = {
            type: choice(b, 'type', ['BANK', 'CASH'], 'BANK'),
            bankName: str(b, 'bankName', 200, ''),
            accountNumber: str(b, 'accountNumber', 100, ''),
            iban: str(b, 'iban', 100, ''),
            bic: str(b, 'bic', 100, ''),
            name: str(b, 'name'),
            currency: currency(b),
            openingBalance: dec(b, 'openingBalance', '0', '-999999999999', '999999999999', 2),
            active: bool(b, 'active', true),
          };
          if (recordId) {
            const old = await owned(
              await tx.bankAccount.findFirst({ where: { id: recordId, companyId } }),
            );
            if (
              ((await tx.payment.count({ where: { accountId: recordId } })) ||
                (await tx.bankEntry.count({ where: { accountId: recordId } }))) &&
              (!old.openingBalance.eq(data.openingBalance) || old.currency !== data.currency)
            )
              throw new ConflictException('已有资金流水，不能修改币种和期初余额');
            result = await tx.bankAccount.update({ where: { id: recordId }, data });
          } else result = await tx.bankAccount.create({ data: { ...data, companyId } });
          break;
        }
        case 'posts': {
          const slug = str(b, 'slug', 160);
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
            throw new BadRequestException('文章路径仅支持小写字母、数字和连字符');
          const status = choice(b, 'status', ['DRAFT', 'PUBLISHED', 'ARCHIVED'], 'DRAFT');
          const old = recordId
            ? await owned(await tx.post.findFirst({ where: { id: recordId, companyId } }))
            : null;
          const data = {
            title: str(b, 'title'),
            slug,
            excerpt: str(b, 'excerpt', 1000, ''),
            content: str(b, 'content', 100000),
            coverUrl: url(str(b, 'coverUrl', 2000, '')),
            status,
            publishedAt:
              status === 'PUBLISHED'
                ? (old?.publishedAt ?? new Date())
                : (old?.publishedAt ?? null),
          };
          result = recordId
            ? await tx.post.update({ where: { id: recordId }, data })
            : await tx.post.create({ data: { ...data, companyId } });
          break;
        }
        case 'company': {
          const data = {
            name: str(b, 'name'),
            currency: currency(b),
            address: str(b, 'address', 2000, ''),
            taxNumber: str(b, 'taxNumber', 100, ''),
          };
          const old = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
          if (
            old.currency !== data.currency &&
            ((await tx.document.count({ where: { companyId } })) ||
              (await tx.product.count({ where: { companyId } })))
          )
            throw new ConflictException('已有产品或单据，不能改变本位币');
          result = await tx.company.update({ where: { id: companyId }, data });
          break;
        }
        case 'companies': {
          if (recordId) throw new BadRequestException('请切换公司后修改');
          result = await tx.company.create({
            data: {
              code: str(b, 'code', 32).toUpperCase(),
              name: str(b, 'name'),
              currency: currency(b),
              memberships: { create: { userId: c.userId, role: 'ADMIN' } },
            },
          });
          break;
        }
        case 'users': {
          if (recordId) {
            const member = await owned(
              await tx.membership.findUnique({
                where: { userId_companyId: { userId: recordId, companyId } },
                include: { user: true },
              }),
            );
            const role = choice(b, 'role', roles, member.role);
            const active = bool(b, 'active', member.user.active);
            const nextName = str(b, 'name', 200, member.user.name),
              nextEmail = b.email === undefined ? member.user.email : email(b),
              globalChange =
                active !== member.user.active ||
                nextName !== member.user.name ||
                nextEmail !== member.user.email;
            if (globalChange) {
              const memberships = await tx.membership.findMany({ where: { userId: recordId } });
              const managed = await tx.membership.findMany({
                where: { userId: c.userId, role: 'ADMIN', user: { active: true } },
              });
              if (memberships.some((m) => !managed.some((a) => a.companyId === m.companyId)))
                throw new ForbiddenException('启停跨公司账号须在其所有公司拥有管理员权限');
              if (!active && member.user.active) {
                for (const m of memberships) {
                  if (
                    m.role === 'ADMIN' &&
                    !(await tx.membership.count({
                      where: {
                        companyId: m.companyId,
                        role: 'ADMIN',
                        userId: { not: recordId },
                        user: { active: true },
                      },
                    }))
                  )
                    throw new ConflictException('每家公司至少保留一名启用的管理员');
                }
              }
              await tx.user.update({
                where: { id: recordId },
                data: { active, name: nextName, email: nextEmail },
              });
              if (!active && member.user.active)
                await tx.session.deleteMany({ where: { userId: recordId } });
              if (active !== member.user.active)
                await audit(tx, c, active ? 'ENABLE' : 'DISABLE', 'users', recordId);
            }
            if (
              active &&
              member.role === 'ADMIN' &&
              role !== 'ADMIN' &&
              !(await tx.membership.count({
                where: {
                  companyId,
                  role: 'ADMIN',
                  userId: { not: recordId },
                  user: { active: true },
                },
              }))
            )
              throw new ConflictException('至少保留一名启用的公司管理员');
            await tx.membership.update({
              where: { userId_companyId: { userId: recordId, companyId } },
              data: { role },
            });
            result = { id: recordId };
          } else {
            const role = choice(b, 'role', roles, 'VIEWER');
            const mail = email(b);
            let user = await tx.user.findUnique({ where: { email: mail } });
            if (!user) {
              if (!hash) throw new BadRequestException('新用户须设置 12 位以上密码');
              user = await tx.user.create({
                data: {
                  email: mail,
                  name: str(b, 'name'),
                  passwordHash: hash,
                  active: bool(b, 'active', true),
                },
              });
            } else if (b.active !== undefined && bool(b, 'active') !== user.active) {
              throw new ConflictException(
                '添加已有账号的公司权限不能更改其启用状态，请通过编辑账号操作',
              );
            }
            await tx.membership.create({ data: { userId: user.id, companyId, role } });
            result = { id: user.id };
          }
          break;
        }
        default:
          throw new BadRequestException('不支持的资源');
      }
      await audit(tx, c, recordId ? 'UPDATE' : 'CREATE', resource, result.id);
      return result;
    });
  }
  async removeUser(c: Context, userId: string) {
    permit(c, 'settings');
    return atomic(this.db, async (tx) => {
      const m = await owned(
        await tx.membership.findUnique({
          where: { userId_companyId: { userId, companyId: c.companyId } },
        }),
      );
      if (
        m.role === 'ADMIN' &&
        (await tx.user.findUniqueOrThrow({ where: { id: userId } })).active &&
        (await tx.membership.count({
          where: { companyId: c.companyId, role: 'ADMIN', user: { active: true } },
        })) <= 1
      )
        throw new ConflictException('至少保留一名启用的管理员');
      await tx.membership.delete({
        where: { userId_companyId: { userId, companyId: c.companyId } },
      });
      const remaining = await tx.membership.count({ where: { userId } });
      await audit(tx, c, 'REMOVE', 'users', userId);
      if (!remaining) await tx.user.delete({ where: { id: userId } });
      return { ok: true, accountDeleted: remaining === 0 };
    });
  }
  async resetUserPassword(c: Context, userId: string, raw: unknown) {
    permit(c, 'settings');
    id({ userId }, 'userId');
    const hash = await hashPassword(password(object(raw)));
    return atomic(this.db, async (tx) => {
      await owned(
        await tx.membership.findUnique({
          where: { userId_companyId: { userId, companyId: c.companyId } },
        }),
      );
      const memberships = await tx.membership.findMany({ where: { userId } }),
        managed = await tx.membership.findMany({
          where: { userId: c.userId, role: 'ADMIN', user: { active: true } },
        });
      if (memberships.some((membership) => !managed.some((admin) => admin.companyId === membership.companyId)))
        throw new ForbiddenException('修改跨公司账号密码须在其所有公司拥有管理员权限');
      await tx.user.update({ where: { id: userId }, data: { passwordHash: hash } });
      await tx.session.deleteMany({ where: { userId } });
      await audit(tx, c, 'RESET_PASSWORD', 'users', userId);
      return { ok: true };
    });
  }
}
