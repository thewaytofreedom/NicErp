// Adds clearly marked demo records through business services; never clears data.
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../apps/api/dist/app.module.js';
import { PrismaService } from '../apps/api/dist/database/prisma.service.js';
import { CatalogService } from '../apps/api/dist/erp/catalog.service.js';
import { DocumentsService } from '../apps/api/dist/erp/documents.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const db = app.get(PrismaService);
  const catalog = app.get(CatalogService);
  const documents = app.get(DocumentsService);
  const companies = await db.company.findMany({
    where: process.env.DEMO_COMPANY_ID ? { id: process.env.DEMO_COMPANY_ID } : {},
    include: { memberships: { where: { role: 'ADMIN' }, include: { user: true } } },
  });
  if (companies.length !== 1) throw Error('Set DEMO_COMPANY_ID to select exactly one company.');
  const company = companies[0];
  const admin = company.memberships.find((m) => m.user.active);
  if (!admin) throw Error('Company requires an active administrator.');
  const c = {
    companyId: company.id,
    userId: admin.userId,
    name: admin.user.name,
    role: 'ADMIN',
    sessionId: 'demo-seed',
  };
  const where = { companyId: company.id };
  let created = 0;
  async function ensure(resource, model, key, body) {
    const existing = await db[model].findFirst({ where: { ...where, ...key } });
    if (existing) return existing;
    const record = await catalog.save(c, resource, body);
    created++;
    return record;
  }
  const lookup = (kind, name) => ensure('lookups', 'lookup', { kind, name }, { kind, name });
  const brand = await lookup('BRAND', '演示品牌');
  const category = await lookup('CATEGORY', '滤清与保养（测试）');
  const series = await lookup('SERIES', '柴油发动机系列（测试）');
  await lookup('CATEGORY', '传动与密封（测试）');
  const specs = [
    ['DEMO-P001', '机油滤清器（测试）', '35', '20', '100'],
    ['DEMO-P002', '空气滤清器（测试）', '68', '42', '80'],
    ['DEMO-P003', '燃油滤清器（测试）', '55', '32', '60'],
    ['DEMO-P004', '发动机皮带（测试）', '120', '75', '40'],
    ['DEMO-P005', '密封垫片（测试）', '15', '6', '200'],
    ['DEMO-P006', '轴承（测试）', '85', '50', '50'],
  ];
  const products = [];
  for (const [sku, name, salePrice, costPrice] of specs) {
    products.push(
      await ensure(
        'products',
        'product',
        { sku },
        {
          sku,
          name,
          salePrice,
          costPrice,
          brandId: brand.id,
          categoryId: category.id,
          seriesId: series.id,
          taxRate: '0',
          unit: '件',
          description: '演示测试资料，可用于练习业务流程。',
        },
      ),
    );
  }
  await ensure(
    'products',
    'product',
    { sku: 'DEMO-S001' },
    {
      sku: 'DEMO-S001',
      name: '发动机保养服务（测试）',
      type: 'SERVICE',
      unit: '次',
      salePrice: '300',
      costPrice: '150',
      taxRate: '0',
    },
  );
  await ensure(
    'products',
    'product',
    { sku: 'DEMO-K001' },
    {
      sku: 'DEMO-K001',
      name: '滤清器保养套装（测试）',
      type: 'KIT',
      unit: '套',
      salePrice: '150',
      costPrice: '94',
      taxRate: '0',
      components: products.slice(0, 3).map((p) => ({ productId: p.id, quantity: '1' })),
    },
  );
  const partnerSpecs = [
    ['DEMO-C001', '华东汽配客户（测试）', 'CUSTOMER', '张先生'],
    ['DEMO-C002', '南方维修客户（测试）', 'CUSTOMER', '李女士'],
    ['DEMO-S001', '精工配件供应商（测试）', 'SUPPLIER', '王先生'],
    ['DEMO-S002', '恒通滤清供应商（测试）', 'SUPPLIER', '陈女士'],
    ['DEMO-B001', '综合贸易伙伴（测试）', 'BOTH', '刘先生'],
  ];
  const partners = [];
  for (const [code, name, type, contact] of partnerSpecs) {
    partners.push(
      await ensure(
        'partners',
        'partner',
        { code },
        {
          code,
          name,
          type,
          contact,
          email: `${code.toLowerCase()}@example.com`,
          address: '演示地址',
          notes: '虚构测试资料',
        },
      ),
    );
  }
  const warehouses = [];
  for (const [code, name] of [
    ['DEMO-W001', '主仓库（测试）'],
    ['DEMO-W002', '备用仓库（测试）'],
  ]) {
    warehouses.push(
      await ensure('warehouses', 'warehouse', { code }, { code, name, address: '演示仓库地址' }),
    );
  }
  for (const [name, openingBalance] of [
    ['银行账户（测试）', '50000'],
    ['现金账户（测试）', '5000'],
  ]) {
    await ensure(
      'accounts',
      'bankAccount',
      { name },
      { name, currency: company.currency, openingBalance },
    );
  }
  for (let i = 0; i < products.length; i++) {
    await documents.adjust(c, {
      warehouseId: warehouses[0].id,
      productId: products[i].id,
      quantity: specs[i][4],
      note: '测试数据期初库存',
      requestKey: `demo-seed-v1-${specs[i][0]}`,
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const kind of ['QUOTE', 'SALE', 'PURCHASE', 'INVOICE', 'BILL']) {
    const notes = `DEMO-SEED-V1 ${kind} 测试草稿`;
    if (await db.document.findFirst({ where: { ...where, notes } })) continue;
    const purchasing = ['PURCHASE', 'BILL'].includes(kind);
    await documents.save(c, {
      kind,
      partnerId: partners[purchasing ? 2 : 0].id,
      date: today,
      currency: company.currency,
      exchangeRate: '1',
      notes,
      lines: products
        .slice(0, 2)
        .map((p, i) => ({
          productId: p.id,
          quantity: String(i ? 5 : 10),
          unitPrice: specs[i][purchasing ? 3 : 2],
          taxRate: '0',
        })),
    });
    created++;
  }
  await ensure(
    'posts',
    'post',
    { slug: 'demo-welcome' },
    {
      slug: 'demo-welcome',
      title: '欢迎使用 NicErp（测试文章）',
      content: '这是一篇测试草稿，用于体验文章编辑与预览。',
      status: 'DRAFT',
    },
  );
  console.log(
    JSON.stringify(
      {
        company: company.name,
        currency: company.currency,
        created,
        totals: {
          products: await db.product.count({ where }),
          partners: await db.partner.count({ where }),
          warehouses: await db.warehouse.count({ where }),
          accounts: await db.bankAccount.count({ where }),
          documents: await db.document.count({ where }),
          stockBalances: await db.stockBalance.count({ where: { warehouse: where } }),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
