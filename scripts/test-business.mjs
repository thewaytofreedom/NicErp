// Deliberately runs only on the isolated nicerp_test database. Never point this at a business database.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const database = new URL(process.env.DATABASE_URL);
database.pathname = '/nicerp_test';
process.env.DATABASE_URL = database.toString();
if (new URL(process.env.DATABASE_URL).pathname !== '/nicerp_test')
  throw Error('Refusing non-test database');
const migrate = spawnSync('npm', ['run', 'db:push', '-w', '@nicerp/api'], {
  env: process.env,
  stdio: 'inherit',
});
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../apps/api/dist/app.module.js');
const { PrismaService } = await import('../apps/api/dist/database/prisma.service.js');
const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix('api/v1');
const db = app.get(PrismaService);
await db.$executeRawUnsafe('TRUNCATE TABLE users, companies CASCADE');
await app.listen(0, '127.0.0.1');
const base = await app.getUrl();
const adminPassword = 'Nicerp-test-' + randomUUID();
let token = '',
  companyId = '',
  passed = 0;
async function call(path, method = 'GET', body, options = {}) {
  const r = await fetch(base + '/api/v1/' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...((options.token ?? token) ? { Authorization: 'Bearer ' + (options.token ?? token) } : {}),
      ...((options.companyId ?? companyId)
        ? { 'x-company-id': options.companyId ?? companyId }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  const expected = options.status ?? (method === 'POST' ? 201 : 200);
  assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
function pass(name) {
  console.log('PASS', name);
  passed++;
}
const today = new Date().toISOString().slice(0, 10);
let fixture;
try {
  await call('erp/bootstrap', 'GET', undefined, { token: '', status: 401 });
  const setup = await call('auth/setup', 'POST', {
    email: 'admin@nicerp.test',
    password: adminPassword,
    name: 'Test Admin',
    companyName: '测试公司 A',
    currency: 'SGD',
  });
  token = setup.token;
  const me = await call('auth/me');
  companyId = me.companyId;
  await call(
    'auth/setup',
    'POST',
    {
      email: 'other@nicerp.test',
      password: adminPassword,
      name: 'Other',
      companyName: 'Bad',
      currency: 'SGD',
    },
    { status: 409 },
  );
  await call(
    'auth/login',
    'POST',
    { email: 'admin@nicerp.test', password: 'wrong' },
    { status: 401 },
  );
  pass('setup, session authentication and setup lock');
  const p = await call('erp/products', 'POST', {
    sku: 'PART-01',
    relatedNumbers: ['ALT-PART-01'],
    name: '过滤器',
    salePrice: '19.995',
    costPrice: '8.5',
    taxRate: '9',
  });
  const customer = await call('erp/partners', 'POST', {
    code: 'C001',
    name: '测试客户',
    type: 'CUSTOMER',
  });
  const supplier = await call('erp/partners', 'POST', {
    code: 'V001',
    name: '测试供应商',
    type: 'SUPPLIER',
  });
  const warehouse = await call('erp/warehouses', 'POST', { code: 'MAIN', name: '主仓' });
  const account = await call('erp/accounts', 'POST', {
    name: 'SGD 银行',
    currency: 'SGD',
    openingBalance: '0',
  });
  await call(
    'erp/products',
    'POST',
    { sku: 'BAD', name: 'Invalid', salePrice: '-1' },
    { status: 400 },
  );
  await call('erp/products', 'POST', { sku: 'PART-01', name: '重复' }, { status: 409 });
  pass('master data validation and unique product numbers');
  const viewerPassword = 'Viewer-' + randomUUID();
  await call('erp/users', 'POST', {
    name: '只读用户',
    email: 'viewer@nicerp.test',
    password: viewerPassword,
    role: 'VIEWER',
  });
  const viewer = await call('auth/login', 'POST', {
    email: 'viewer@nicerp.test',
    password: viewerPassword,
  });
  await call('erp/products', 'GET', undefined, { token: viewer.token });
  await call(
    'erp/products',
    'POST',
    { sku: 'NO', name: 'No access' },
    { token: viewer.token, status: 403 },
  );
  await call('erp/users', 'GET', undefined, { token: viewer.token, status: 403 });
  pass('role permissions enforce read-only access');
  const companyB = await call('erp/companies', 'POST', {
    code: 'B',
    name: '测试公司 B',
    currency: 'USD',
  });
  await call(
    'erp/products/' + p.id,
    'PATCH',
    { sku: 'HACK', name: 'Wrong tenant' },
    { companyId: companyB.id, status: 404 },
  );
  assert.equal((await call('erp/products', 'GET', undefined, { companyId: companyB.id })).total, 0);
  await call('erp/bootstrap', 'GET', undefined, {
    token: viewer.token,
    companyId: companyB.id,
    status: 401,
  });
  pass('company isolation rejects cross-company access');
  const { runUserLifecycle } = await import('./test-user-lifecycle.mjs');
  await runUserLifecycle({ call, db, companyId, companyB, adminId: me.id, pass });
  const adjust = {
    warehouseId: warehouse.id,
    productId: p.id,
    quantity: '20',
    note: '测试期初',
    requestKey: randomUUID(),
  };
  const movement = await call('erp/inventory/adjust', 'POST', adjust);
  assert.equal((await call('erp/inventory/adjust', 'POST', adjust)).id, movement.id);
  await call('erp/inventory/adjust', 'POST', { ...adjust, quantity: '21' }, { status: 409 });
  await call(
    'erp/inventory/adjust',
    'POST',
    { ...adjust, quantity: '-30', requestKey: randomUUID() },
    { status: 409 },
  );
  assert.equal((await call('erp/stock')).rows[0].quantity, '20');
  pass('stock adjustment idempotency and negative-stock rollback');
  const quoteBody = {
    kind: 'QUOTE',
    partnerId: customer.id,
    currency: 'SGD',
    exchangeRate: '1',
    discountRate: '5',
    date: today,
    lines: [
      { productId: p.id, quantity: '10', unitPrice: '19.995', discountRate: '10', taxRate: '9' },
      { kind: 'SUBTOTAL', description: '配件小计' },
      { kind: 'NOTE', description: '交货前确认' },
    ],
  };
  const quote = await call('erp/documents', 'POST', quoteBody);
  assert.equal(quote.subtotal, '170.96');
  assert.equal(quote.taxTotal, '15.39');
  assert.equal(quote.total, '186.35');
  await call(`erp/documents/${quote.id}`, 'GET', undefined, {
    companyId: companyB.id,
    status: 404,
  });
  await call('erp/documents', 'POST', { ...quoteBody, exchangeRate: '2' }, { status: 400 });
  const otherPartner = await call(
    'erp/partners',
    'POST',
    { code: 'C', name: 'B 客户', type: 'CUSTOMER' },
    { companyId: companyB.id },
  );
  await call(
    'erp/documents',
    'POST',
    { ...quoteBody, partnerId: otherPartner.id, currency: 'USD' },
    { companyId: companyB.id, status: 404 },
  );
  await call(`erp/documents/${quote.id}/confirm`, 'POST', {});
  await call(`erp/documents/${quote.id}`, 'PATCH', { ...quoteBody, version: 1 }, { status: 409 });
  const sale = await call(`erp/documents/${quote.id}/convert`, 'POST', { kind: 'SALE' });
  assert.equal(
    (await call(`erp/documents/${quote.id}/convert`, 'POST', { kind: 'SALE' })).id,
    sale.id,
  );
  pass('exact decimals, discount, tax, snapshots and quote conversion');
  await call(`erp/documents/${sale.id}/confirm`, 'POST', {});
  const purchase = await call(`erp/documents/${sale.id}/convert`, 'POST', {
    kind: 'PURCHASE',
    partnerId: supplier.id,
  });
  assert.equal(purchase.currency, 'SGD');
  assert.equal(purchase.subtotal, '85');
  await call(`erp/documents/${purchase.id}/confirm`, 'POST', {});
  let detail = await call(`erp/documents/${purchase.id}`);
  const purchaseLine = detail.lines.find((l) => l.kind === 'ITEM').id;
  const receive = {
    warehouseId: warehouse.id,
    requestKey: randomUUID(),
    lines: [{ lineId: purchaseLine, quantity: '6' }],
  };
  const receipt = await call(`erp/documents/${purchase.id}/fulfill`, 'POST', receive);
  assert.equal(
    (await call(`erp/documents/${purchase.id}/fulfill`, 'POST', receive)).id,
    receipt.id,
  );
  assert.equal((await call(`erp/documents/${purchase.id}`)).status, 'PARTIAL');
  await call(
    `erp/documents/${purchase.id}/fulfill`,
    'POST',
    { ...receive, requestKey: randomUUID(), lines: [{ lineId: purchaseLine, quantity: '5' }] },
    { status: 409 },
  );
  await call(`erp/documents/${purchase.id}/fulfill`, 'POST', {
    ...receive,
    requestKey: randomUUID(),
    lines: [{ lineId: purchaseLine, quantity: '4' }],
  });
  assert.equal((await call(`erp/documents/${purchase.id}`)).status, 'FULFILLED');
  pass('purchase partial receipt, duplicate receipt and over-receipt protection');
  detail = await call(`erp/documents/${sale.id}`);
  const saleLine = detail.lines.find((l) => l.kind === 'ITEM').id;
  const ship = {
    warehouseId: warehouse.id,
    requestKey: randomUUID(),
    lines: [{ lineId: saleLine, quantity: '6' }],
  };
  await call(`erp/documents/${sale.id}/fulfill`, 'POST', ship);
  await call(`erp/documents/${sale.id}/fulfill`, 'POST', {
    ...ship,
    requestKey: randomUUID(),
    action: 'RETURN',
    lines: [{ lineId: saleLine, quantity: '2' }],
  });
  const wh2 = await call('erp/warehouses', 'POST', { code: 'OTHER', name: '另一仓库' });
  await call(
    `erp/documents/${sale.id}/fulfill`,
    'POST',
    {
      ...ship,
      warehouseId: wh2.id,
      requestKey: randomUUID(),
      action: 'RETURN',
      lines: [{ lineId: saleLine, quantity: '1' }],
    },
    { status: 409 },
  );
  await call(`erp/documents/${sale.id}/fulfill`, 'POST', { ...ship, requestKey: randomUUID() });
  assert.equal((await call(`erp/documents/${sale.id}`)).status, 'FULFILLED');
  assert.equal((await call('erp/stock')).rows.find((r) => r.productId === p.id).quantity, '20');
  pass('partial shipment, warehouse-bound returns and stock ledger');
  const invoice = await call(`erp/documents/${sale.id}/convert`, 'POST', { kind: 'INVOICE' });
  await call(`erp/documents/${invoice.id}/confirm`, 'POST', {});
  const paymentBody = {
    accountId: account.id,
    amount: '100',
    date: today,
    reference: 'TEST-100',
    requestKey: randomUUID(),
  };
  const payment = await call(`erp/documents/${invoice.id}/pay`, 'POST', paymentBody);
  assert.equal((await call(`erp/documents/${invoice.id}/pay`, 'POST', paymentBody)).id, payment.id);
  await call(
    `erp/documents/${invoice.id}/pay`,
    'POST',
    { ...paymentBody, amount: '100', requestKey: randomUUID() },
    { status: 409 },
  );
  await call(`erp/documents/${invoice.id}/pay`, 'POST', {
    ...paymentBody,
    amount: '86.35',
    requestKey: randomUUID(),
  });
  assert.equal((await call(`erp/documents/${invoice.id}`)).paidAmount, '186.35');
  await call(`erp/payments/${payment.id}/reverse`, 'POST', {});
  await call(`erp/payments/${payment.id}/reverse`, 'POST', {});
  assert.equal((await call(`erp/documents/${invoice.id}`)).paidAmount, '86.35');
  assert.equal((await call('erp/accounts')).rows.find((a) => a.id === account.id).balance, '86.35');
  await call(`erp/documents/${invoice.id}/void`, 'POST', {}, { status: 409 });
  const dashboard = await call('erp/dashboard');
  assert.equal(dashboard.receivable, '100.00');
  pass('invoice payments, overpayment prevention, reversal and dashboard balances');
  const kit = await call('erp/products', 'POST', {
    sku: 'KIT-01',
    name: '双件套',
    type: 'KIT',
    salePrice: '50',
    components: [{ productId: p.id, quantity: '2' }],
  });
  const kitOrder = await call('erp/documents', 'POST', {
    kind: 'SALE',
    partnerId: customer.id,
    date: today,
    lines: [{ productId: kit.id, quantity: '1', unitPrice: '50' }],
  });
  await call(`erp/documents/${kitOrder.id}/confirm`, 'POST', {});
  const kitLine = (await call(`erp/documents/${kitOrder.id}`)).lines[0].id;
  await call(`erp/documents/${kitOrder.id}/fulfill`, 'POST', {
    warehouseId: warehouse.id,
    requestKey: randomUUID(),
    lines: [{ lineId: kitLine, quantity: '1' }],
  });
  assert.equal((await call('erp/stock')).rows.find((r) => r.productId === p.id).quantity, '18');
  pass('kit expansion uses component stock snapshots');
  const race = await call('erp/documents', 'POST', {
    kind: 'SALE',
    partnerId: customer.id,
    date: today,
    lines: [{ productId: p.id, quantity: '5', unitPrice: '10' }],
  });
  await call(`erp/documents/${race.id}/confirm`, 'POST', {});
  const raceLine = (await call(`erp/documents/${race.id}`)).lines[0].id;
  const raceResults = await Promise.all(
    [1, 2].map(() =>
      fetch(base + `/api/v1/erp/documents/${race.id}/fulfill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
          'x-company-id': companyId,
        },
        body: JSON.stringify({
          warehouseId: warehouse.id,
          requestKey: randomUUID(),
          lines: [{ lineId: raceLine, quantity: '5' }],
        }),
      }),
    ),
  );
  assert.deepEqual(raceResults.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await call('erp/stock')).rows.find((r) => r.productId === p.id).quantity, '13');
  pass('concurrent shipments cannot double-consume inventory');
  const transfer = {
    warehouseId: warehouse.id,
    targetWarehouseId: wh2.id,
    productId: p.id,
    quantity: '3',
    note: '仓库调拨测试',
    requestKey: randomUUID(),
  };
  const transferred = await call('erp/inventory/transfer', 'POST', transfer);
  assert.equal((await call('erp/inventory/transfer', 'POST', transfer)).id, transferred.id);
  const balances = (await call('erp/stock')).rows;
  assert.equal(
    balances.find((r) => r.warehouseId === warehouse.id && r.productId === p.id).quantity,
    '10',
  );
  assert.equal(
    balances.find((r) => r.warehouseId === wh2.id && r.productId === p.id).quantity,
    '3',
  );
  await call(
    'erp/inventory/transfer',
    'POST',
    { ...transfer, quantity: '999', requestKey: randomUUID() },
    { status: 409 },
  );
  pass('atomic warehouse transfer and insufficient-stock rollback');
  const foreign = await call('erp/documents', 'POST', {
    kind: 'INVOICE',
    partnerId: customer.id,
    currency: 'USD',
    exchangeRate: '1.35',
    date: today,
    lines: [{ productId: p.id, quantity: '1', unitPrice: '100', taxRate: '0' }],
  });
  await call(`erp/documents/${foreign.id}/confirm`, 'POST', {});
  await call(
    `erp/documents/${foreign.id}/pay`,
    'POST',
    { ...paymentBody, requestKey: randomUUID(), amount: '10' },
    { status: 400 },
  );
  assert.equal((await call('erp/dashboard')).receivable, '235.00');
  pass('foreign-currency snapshots and matching-currency account enforcement');
  const draft = await call('erp/documents', 'POST', quoteBody);
  await call(`erp/documents/${draft.id}`, 'PATCH', { ...quoteBody, version: 1 });
  await call(`erp/documents/${draft.id}`, 'PATCH', { ...quoteBody, version: 1 }, { status: 409 });
  pass('optimistic locking prevents stale draft overwrite');
  const post = await call('erp/posts', 'POST', {
    title: '公司新闻',
    slug: 'company-news',
    content: '安全正文 <script>alert(1)</script>',
    status: 'PUBLISHED',
  });
  assert.equal((await call(`erp/posts/${post.id}`)).status, 'PUBLISHED');
  await call(`erp/posts/${post.id}`, 'GET', undefined, { companyId: companyB.id, status: 404 });
  const imported = await call('erp/import/products', 'POST', {
    rows: [
      { sku: 'CSV-1', name: '导入产品' },
      { sku: 'CSV-1', name: '重复产品' },
    ],
  });
  assert.equal(imported.created, 1);
  assert.equal(imported.errors.length, 1);
  pass('content ownership and explicit partial-import results');
  assert.ok((await call('erp/audit')).total > 20);
  pass('business changes write audit records');
  const { runParity } = await import('./test-parity.mjs');
  const parity = await runParity(call, {
    db,
    companyId,
    companyB,
    customer,
    supplier,
    today,
    viewerToken: viewer.token,
  });
  await db.product.createMany({
    data: Array.from({ length: 1001 }, (_, i) => ({
      companyId,
      sku: `ZZZ-${String(i).padStart(4, '0')}`,
      name: '大量产品匹配测试',
      relatedNumbers: i === 1000 ? ['LATE-ALT'] : [],
    })),
  });
  const lateMatch = await call('erp/products?match=number&exact=1&q=late-alt');
  assert.equal(lateMatch.total, 1);
  assert.equal(lateMatch.rows[0].sku, 'ZZZ-1000');
  assert.equal((await call('erp/products?match=number&exact=1&q=PART-01')).total, 1);
  assert.equal((await call('erp/products?match=number&exact=1&q=过滤器')).total, 0);
  assert.equal(
    (
      await call('erp/products?match=number&exact=1&q=LATE-ALT', 'GET', undefined, {
        companyId: companyB.id,
      })
    ).total,
    0,
  );
  await db.product.create({
    data: {
      companyId,
      sku: 'ZZZ-INACTIVE',
      name: '停用产品',
      active: false,
      relatedNumbers: ['LATE-ALT'],
    },
  });
  assert.equal((await call('erp/products?match=number&exact=1&q=LATE-ALT')).total, 1);
  await db.product.create({
    data: { companyId, sku: 'ZZZ-SHARED', name: '共享替代号产品', relatedNumbers: ['LATE-ALT'] },
  });
  assert.equal((await call('erp/products?match=number&exact=1&q=LATE-ALT')).total, 2);
  pass(
    'number matching searches beyond bootstrap limit, handles shared aliases and excludes inactive and other-company products',
  );
  const { runQuoteSequence } = await import('./test-quote-sequence.mjs');
  await runQuoteSequence({ call, companyB, customer, today, viewerToken: viewer.token, pass });
  const { runLanguage } = await import('./test-language.mjs');
  await runLanguage({
    call,
    companyB,
    viewerToken: viewer.token,
    email: 'admin@nicerp.test',
    password: adminPassword,
    pass,
  });
  fixture = {
    parity,
    apiUrl: base,
    email: 'admin@nicerp.test',
    password: adminPassword,
    viewerEmail: 'viewer@nicerp.test',
    viewerPassword,
    companyId,
    quoteId: quote.id,
    saleId: sale.id,
    invoiceId: invoice.id,
    postId: post.id,
  };
  console.log(`${passed} business scenarios passed.`);
  if (process.env.BROWSER_TEST === '1') {
    const { runBrowser } = await import('./test-browser.mjs');
    await runBrowser(fixture);
  }
} finally {
  await app.close();
}
