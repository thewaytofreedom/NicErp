import assert from 'node:assert/strict';

export async function runQuoteSequence({ call, companyB, customer, today, viewerToken, pass }) {
  const item = (description, position, unitPrice = '10') => ({
    kind: 'ITEM',
    freeText: true,
    description,
    position,
    quantity: '1',
    unitPrice,
    taxRate: '0',
  });
  const body = { kind: 'QUOTE', partnerId: customer.id, date: today };
  const automatic = await call('erp/documents', 'POST', {
    ...body,
    lines: [item('自动一'), item('自动二')],
  });
  assert.deepEqual(
    (await call(`erp/documents/${automatic.id}`)).lines.map((l) => l.position),
    [0, 1],
  );
  const input = [item('第三', 19), item('第一', 1), item('第二', 9)];
  const quote = await call('erp/documents', 'POST', { ...body, lines: input });
  const original = await call(`erp/documents/${quote.id}`);
  assert.deepEqual(
    original.lines.map((l) => [l.position, l.description]),
    [
      [1, '第一'],
      [9, '第二'],
      [19, '第三'],
    ],
  );
  assert.equal(original.total, '30');
  await call(
    `erp/documents/${quote.id}`,
    'PATCH',
    { ...body, version: 1, lines: input },
    { token: viewerToken, status: 403 },
  );
  await call(
    `erp/documents/${quote.id}`,
    'PATCH',
    { ...body, version: 1, lines: input },
    { companyId: companyB.id, status: 404 },
  );
  for (const bad of [-1, 0.5, 1000000, 'invalid'])
    await call(
      `erp/documents/${quote.id}`,
      'PATCH',
      { ...body, version: 1, lines: [item('非法序号', bad)] },
      { status: 400 },
    );
  await call(
    `erp/documents/${quote.id}`,
    'PATCH',
    { ...body, version: 1, lines: [item('重复一', 1), item('重复二', 1)] },
    { status: 400 },
  );
  const unchanged = await call(`erp/documents/${quote.id}`);
  assert.equal(unchanged.version, original.version);
  assert.deepEqual(
    unchanged.lines.map((l) => l.id),
    original.lines.map((l) => l.id),
  );
  const edited = [item('第三', 2), item('第一', 30), item('第二', 15)];
  await call(`erp/documents/${quote.id}`, 'PATCH', { ...body, version: 1, lines: edited });
  assert.deepEqual(
    (await call(`erp/documents/${quote.id}`)).lines.map((l) => [l.position, l.description]),
    [
      [2, '第三'],
      [15, '第二'],
      [30, '第一'],
    ],
  );
  await call(
    `erp/documents/${quote.id}`,
    'PATCH',
    { ...body, version: 1, lines: edited },
    { status: 409 },
  );
  const clone = await call(`erp/documents/${quote.id}/clone`, 'POST', {});
  assert.deepEqual(
    (await call(`erp/documents/${clone.id}`)).lines.map((l) => l.position),
    [2, 15, 30],
  );
  await call(`erp/documents/${quote.id}/confirm`, 'POST', {});
  const sale = await call(`erp/documents/${quote.id}/convert`, 'POST', { kind: 'SALE' });
  assert.deepEqual(
    (await call(`erp/documents/${sale.id}`)).lines.map((l) => [l.position, l.description]),
    [
      [2, '第三'],
      [15, '第二'],
      [30, '第一'],
    ],
  );
  await call(
    `erp/documents/${quote.id}`,
    'PATCH',
    { ...body, version: 3, lines: edited },
    { status: 409 },
  );
  const grouped = await call('erp/documents', 'POST', {
    ...body,
    lines: [
      { kind: 'SUBTOTAL', position: 9, description: '组小计' },
      item('组第二行', 4, '20'),
      { kind: 'TITLE', position: 0, description: '组标题' },
      item('组第一行', 1),
    ],
  });
  const groupedDetail = await call(`erp/documents/${grouped.id}`);
  assert.deepEqual(
    groupedDetail.lines.map((l) => l.position),
    [0, 1, 4, 9],
  );
  assert.equal(groupedDetail.lines.at(-1).net, '30');
  assert.equal(groupedDetail.total, '30');
  const imported = await call('erp/documents/import-lines', 'POST', {
    kind: 'QUOTE',
    rows: [
      { number: 'PART-01', position: 9 },
      { number: 'PART-01', position: 2 },
    ],
  });
  assert.deepEqual(
    imported.lines.map((l) => l.position),
    [2, 9],
  );
  await call(
    'erp/documents/import-lines',
    'POST',
    {
      kind: 'QUOTE',
      rows: [
        { number: 'PART-01', position: 2 },
        { number: 'PART-01', position: 2 },
      ],
    },
    { status: 400 },
  );
  pass(
    'quote sequence defaults, numeric ordering, editing, rollback, permissions, cloning, conversion, group totals and CSV import',
  );
}
