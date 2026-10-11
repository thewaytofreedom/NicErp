import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function runParity(
  call,
  { db, companyId, companyB, customer, supplier, today, viewerToken },
) {
  const contact = await call('erp/contacts', 'POST', {
    partnerId: customer.id,
    name: '报价联系人',
    role: '采购',
    email: 'contact@example.com',
  });
  assert.equal(
    (await call('erp/contacts')).rows.find((r) => r.id === contact.id).partner.id,
    customer.id,
  );
  await call(
    `erp/contacts/${contact.id}`,
    'PATCH',
    { partnerId: customer.id, name: '越权修改' },
    { companyId: companyB.id, status: 404 },
  );
  await call(
    'erp/contacts',
    'POST',
    { partnerId: customer.id, name: '无权限' },
    { token: viewerToken, status: 403 },
  );
  const products = [];
  for (const [sku, relatedNumbers, sourceTag, salePrice] of [
    ['PARITY-GENUINE', ['EQUIV-1'], 'DCEC2026', '30'],
    ['PARITY-SN', ['EQUIV-1', 'EQUIV-2'], 'SN2026', '20'],
    ['PARITY-WD', ['EQUIV-2', 'EQUIV-3'], 'WD', '5'],
  ])
    products.push(
      await call('erp/products', 'POST', {
        sku,
        name: sku,
        relatedNumbers,
        sourceTag,
        salePrice,
        costPrice: '3',
        model: 'M-TEST',
      }),
    );
  const equivalent = await call('erp/products?match=number&exact=1&q=equiv-3');
  assert.equal(equivalent.total, 3);
  assert.equal(
    (
      await call('erp/products?match=number&exact=1&q=EQUIV-3', 'GET', undefined, {
        companyId: companyB.id,
      })
    ).total,
    0,
  );
  const importBody = {
    kind: 'QUOTE',
    currency: 'SGD',
    exchangeRate: '1',
    rows: [{ number: 'EQUIV-3', quantity: '2.5' }],
  };
  const count = await db.document.count({ where: { companyId } });
  for (const [preference, index] of [
    ['1', 1],
    ['2', 0],
    ['3', 0],
    ['4', 0],
    ['5', 1],
    ['6', 2],
  ]) {
    const preview = await call('erp/documents/import-lines', 'POST', { ...importBody, preference });
    assert.equal(preview.lines[0].productId, products[index].id);
    assert.equal(preview.lines[0].quantity, '2.5');
  }
  assert.equal(
    (
      await call('erp/documents/import-lines', 'POST', {
        ...importBody,
        preference: '7',
        rows: [{ number: 'PARITY-WD', quantity: '1', unitPrice: '9.5' }],
      })
    ).lines[0].unitPrice,
    '9.5',
  );
  await call(
    'erp/documents/import-lines',
    'POST',
    { ...importBody, preference: 'UNIQUE' },
    { status: 400 },
  );
  const missing = await call('erp/documents/import-lines', 'POST', {
    ...importBody,
    preference: '7',
    rows: [{ number: 'NO-SUCH-PART', description: '待报价零件', quantity: '2' }],
  });
  assert.equal(missing.lines[0].freeText, true);
  assert.equal(missing.warnings.length, 1);
  assert.equal(await db.document.count({ where: { companyId } }), count);
  const freeQuote = await call('erp/documents', 'POST', {
    kind: 'QUOTE',
    partnerId: customer.id,
    date: today,
    lines: missing.lines,
  });
  assert.equal(freeQuote.total, '0');
  const quoteDetail = await call(`erp/documents/${freeQuote.id}`);
  assert.equal(quoteDetail.lines[0].freeText, true);
  assert.equal(Math.round((new Date(quoteDetail.validUntil) - new Date(today)) / 86400000), 15);
  const removedLinks = await call(`erp/products/${products[1].id}`, 'PATCH', {
    ...products[1],
    relatedNumbers: ['EQUIV-1'],
  });
  assert.equal(removedLinks.model, 'M-TEST');
  assert.equal((await call('erp/products?match=number&exact=1&q=EQUIV-3')).total, 1);

  const transformed = await call('erp/documents/transform-lines', 'POST', {
    kind: 'QUOTE',
    mode: 'PRICE',
    percent: '12.5',
    indexes: [0],
    lines: [
      { kind: 'ITEM', unitPrice: '12345.6789', discountRate: '10' },
      { kind: 'NOTE', description: '备注' },
    ],
  });
  assert.equal(transformed.lines[0].unitPrice, '10802.469');
  assert.equal(transformed.lines[0].discountRate, '10');
  await call(
    'erp/documents/transform-lines',
    'POST',
    {
      kind: 'QUOTE',
      mode: 'PRICE',
      percent: '101',
      indexes: [0],
      lines: [{ kind: 'ITEM', unitPrice: '1' }],
    },
    { status: 400 },
  );
  const batchDiscount = await call('erp/documents/transform-lines', 'POST', {
    kind: 'QUOTE',
    mode: 'DISCOUNT',
    percent: '15',
    indexes: [0, 1],
    lines: [
      { kind: 'ITEM', discountRate: '10' },
      { kind: 'NOTE', description: '备注' },
    ],
  });
  assert.equal(batchDiscount.lines[0].discountRate, '15');
  assert.equal(batchDiscount.lines[1].discountRate, undefined);

  const grouped = await call('erp/documents', 'POST', {
    kind: 'QUOTE',
    partnerId: customer.id,
    date: today,
    customerReference: 'REF-PARITY',
    paymentTerms: '30天',
    incoterm: 'FOB',
    incotermLocation: 'Shanghai',
    privateNotes: '内部信息不打印',
    lines: [
      { kind: 'TITLE', description: '外层', level: 1, hidden: true },
      { productId: products[0].id, quantity: '1', unitPrice: '100', taxRate: '10' },
      { kind: 'TITLE', description: '内层', level: 2 },
      { productId: products[2].id, quantity: '2', unitPrice: '25', taxRate: '10' },
      { kind: 'SUBTOTAL', level: 2 },
      { kind: 'SUBTOTAL', level: 1 },
    ],
  });
  const nested = await call(`erp/documents/${grouped.id}`);
  assert.equal(nested.total, '165');
  assert.equal(nested.lines[4].net, '50');
  assert.equal(nested.lines[5].net, '150');
  assert.equal(nested.lines[5].total, '165');
  assert.equal(nested.lines[0].hidden, true);
  const clone = await call(`erp/documents/${grouped.id}/clone`, 'POST', {});
  assert.notEqual(clone.number, grouped.number);
  assert.equal(clone.status, 'DRAFT');
  await call(`erp/documents/${clone.id}/delete`, 'POST', {});
  await call(`erp/documents/${clone.id}`, 'GET', undefined, { status: 404 });
  await call(`erp/documents/${grouped.id}/confirm`, 'POST', {});
  await call(`erp/documents/${grouped.id}/reject`, 'POST', { reason: '客户暂缓' });
  await call(`erp/documents/${grouped.id}/convert`, 'POST', { kind: 'SALE' }, { status: 409 });
  await call(`erp/documents/${grouped.id}/reopen`, 'POST', {});
  await call(`erp/documents/${grouped.id}/confirm`, 'POST', {});
  await call(`erp/documents/${grouped.id}/accept`, 'POST', {});
  const sale = await call(`erp/documents/${grouped.id}/convert`, 'POST', { kind: 'SALE' });
  const saleDetail = await call(`erp/documents/${sale.id}`);
  assert.equal(saleDetail.customerReference, 'REF-PARITY');
  assert.equal(saleDetail.privateNotes, '内部信息不打印');
  assert.equal(saleDetail.lines[5].total, '165');
  await call(`erp/documents/${grouped.id}/reopen`, 'POST', {}, { status: 409 });

  for (const [minQuantity, unitPrice] of [
    ['1', '10'],
    ['10', '8'],
  ])
    await call('erp/supplier-prices', 'POST', {
      productId: products[0].id,
      partnerId: supplier.id,
      currency: 'USD',
      exchangeRate: '1.35',
      minQuantity,
      unitPrice,
      discountRate: '10',
      leadDays: '7',
      supplierSku: 'V-GENUINE',
    });
  const pricing = {
    kind: 'PURCHASE',
    productId: products[0].id,
    partnerId: supplier.id,
    currency: 'SGD',
    exchangeRate: '1',
    date: today,
  };
  assert.equal(
    (await call('erp/documents/purchase-price', 'POST', { ...pricing, quantity: '1' })).unitPrice,
    '12.15',
  );
  assert.equal(
    (await call('erp/documents/purchase-price', 'POST', { ...pricing, quantity: '10' })).unitPrice,
    '9.72',
  );
  await call(
    'erp/documents/purchase-price',
    'POST',
    { ...pricing, quantity: '1' },
    { companyId: companyB.id, status: 404 },
  );
  const report = await call('erp/margins?group=partner');
  assert.ok(report.rows.some((r) => r.name === '测试客户' && Number(r.revenue) > 0));
  assert.equal((await call('erp/margins', 'GET', undefined, { companyId: companyB.id })).total, 0);
  await call('erp/margins?from=2026-10-11&to=2026-10-10', 'GET', undefined, { status: 400 });
  console.log(
    'PASS parity: contacts, transitive aliases, seven sourcing policies, free lines, decimal bulk pricing, nested subtotals, quote lifecycle, supplier tiers and margin reports',
  );
  const bankA = await call('erp/accounts', 'POST', {
    name: 'PARITY 银行 A',
    currency: 'SGD',
    openingBalance: '100',
    bankName: '测试银行',
    accountNumber: 'TEST-001',
  });
  const bankB = await call('erp/accounts', 'POST', {
    name: 'PARITY 银行 B',
    currency: 'SGD',
    openingBalance: '50',
  });
  const bankFx = await call('erp/accounts', 'POST', { name: 'PARITY 外币账户', currency: 'USD' });
  const deposit = {
    accountId: bankA.id,
    direction: 'IN',
    amount: '50',
    date: today,
    reference: 'TEST-DEPOSIT',
    requestKey: randomUUID(),
  };
  const depositOp = await call('erp/bank/transaction', 'POST', deposit);
  assert.equal((await call('erp/bank/transaction', 'POST', deposit)).id, depositOp.id);
  await call('erp/bank/transaction', 'POST', { ...deposit, amount: '51' }, { status: 409 });
  await call(
    'erp/bank/transaction',
    'POST',
    { ...deposit, requestKey: randomUUID() },
    { token: viewerToken, status: 403 },
  );
  await call(
    'erp/bank/transaction',
    'POST',
    { ...deposit, requestKey: randomUUID() },
    { companyId: companyB.id, status: 404 },
  );
  await call('erp/bank/transaction', 'POST', {
    ...deposit,
    direction: 'OUT',
    amount: '10',
    category: '手续费',
    requestKey: randomUUID(),
  });
  const transfer = {
    accountId: bankA.id,
    targetAccountId: bankB.id,
    amount: '25',
    date: today,
    requestKey: randomUUID(),
  };
  const transferOp = await call('erp/bank/transfer', 'POST', transfer);
  assert.equal((await call('erp/bank/transfer', 'POST', transfer)).id, transferOp.id);
  const balances = await call('erp/accounts?q=PARITY');
  assert.equal(balances.rows.find((r) => r.id === bankA.id).balance, '115.00');
  assert.equal(balances.rows.find((r) => r.id === bankB.id).balance, '75.00');
  await call(
    'erp/bank/transfer',
    'POST',
    { ...transfer, targetAccountId: bankFx.id, requestKey: randomUUID() },
    { status: 400 },
  );
  await call(`erp/bank/${transferOp.id}/reverse`, 'POST', {});
  const entry = (await call('erp/bank-entries')).rows.find((r) => r.operationId === depositOp.id);
  await call('erp/bank/reconcile', 'POST', { entryId: entry.id, statementNumber: 'ST-001' });
  await call(`erp/bank/${depositOp.id}/reverse`, 'POST', {}, { status: 409 });
  await call('erp/bank/reconcile', 'POST', { entryId: entry.id, reconcile: false });
  await call(`erp/bank/${depositOp.id}/reverse`, 'POST', {});
  await call(`erp/bank/${depositOp.id}/reverse`, 'POST', {});
  assert.equal(
    (await call('erp/accounts?q=PARITY')).rows.find((r) => r.id === bankA.id).balance,
    '90.00',
  );
  await call(
    `erp/accounts/${bankA.id}`,
    'PATCH',
    { name: bankA.name, currency: 'SGD', openingBalance: '0' },
    { status: 409 },
  );
  assert.equal(
    (await call('erp/bank-entries', 'GET', undefined, { companyId: companyB.id })).total,
    0,
  );
  console.log(
    'PASS parity banking: independent income/expense, atomic same-currency transfers, idempotency, reversal, reconciliation and company/role boundaries',
  );
  const kit1 = await call('erp/products', 'POST', {
    sku: 'PARITY-K1',
    name: '嵌套内组合',
    type: 'KIT',
    components: [
      { productId: products[0].id, quantity: '2' },
      { productId: products[1].id, quantity: '1' },
    ],
  });
  const kit2 = await call('erp/products', 'POST', {
    sku: 'PARITY-K2',
    name: '嵌套外组合',
    type: 'KIT',
    components: [
      { productId: kit1.id, quantity: '3' },
      { productId: products[0].id, quantity: '1' },
    ],
  });
  await call(
    `erp/products/${kit1.id}`,
    'PATCH',
    { ...kit1, components: [{ productId: kit2.id, quantity: '1' }] },
    { status: 400 },
  );
  const warehouse = await db.warehouse.findFirst({ where: { companyId, code: 'MAIN' } });
  for (const [productId, quantity] of [
    [products[0].id, '70'],
    [products[1].id, '30'],
  ])
    await call('erp/inventory/adjust', 'POST', {
      warehouseId: warehouse.id,
      productId,
      quantity,
      note: '嵌套组合测试',
      requestKey: randomUUID(),
    });
  assert.equal((await call('erp/kit-stock?q=PARITY-K2')).rows[0].quantity, '10');
  const nestedSale = await call('erp/documents', 'POST', {
    kind: 'SALE',
    partnerId: customer.id,
    date: today,
    lines: [{ productId: kit2.id, quantity: '2', unitPrice: '100' }],
  });
  const nestedSaleDetail = await call(`erp/documents/${nestedSale.id}`);
  assert.equal(nestedSaleDetail.lines[0].unitCost, '30');
  assert.equal(
    nestedSaleDetail.lines[0].stockParts.find((p) => p.productId === products[0].id).quantity,
    '7',
  );
  await call(`erp/documents/${nestedSale.id}/confirm`, 'POST', {});
  await call(`erp/documents/${nestedSale.id}/fulfill`, 'POST', {
    warehouseId: warehouse.id,
    lines: [{ lineId: nestedSaleDetail.lines[0].id, quantity: '2' }],
    requestKey: randomUUID(),
  });
  assert.equal((await call('erp/kit-stock?q=PARITY-K2')).rows[0].quantity, '8');
  console.log(
    'PASS parity nested kits: cycle rejection, shared-leaf quantities, derived cost, fulfillment snapshots and warehouse assembly capacity',
  );
  return { groupedQuoteId: grouped.id, productId: products[0].id };
}
