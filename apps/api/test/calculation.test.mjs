import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '../dist/generated/prisma/client.js';
import { calculateLine } from '../dist/erp/documents.service.js';
import { dec, date } from '../dist/common/input.js';
const d = (v) => new Prisma.Decimal(v);
test('line discount then header discount, tax rounded per line using decimal arithmetic', () => {
  const r = calculateLine(d('10'), d('19.995'), d('10'), d('5'), d('9'));
  assert.equal(r.net.toString(), '170.96');
  assert.equal(r.tax.toString(), '15.39');
  assert.equal(r.total.toString(), '186.35');
});
test('half-cent rounding is half-up and fully discounted line has zero tax', () => {
  assert.equal(calculateLine(d('1'), d('0.005'), d('0'), d('0'), d('0')).total.toString(), '0.01');
  assert.equal(calculateLine(d('3'), d('100'), d('100'), d('0'), d('9')).total.toString(), '0');
});
test('reject non-finite, scientific notation, excessive precision and negative quantities', () => {
  for (const quantity of ['NaN', 'Infinity', '1e9', '0.00001', '-1'])
    assert.throws(() => dec({ quantity }, 'quantity', '1', '0.0001'));
});
test('reject invalid calendar dates rather than rolling into next month', () => {
  assert.throws(() => date({ date: '2026-02-30' }, 'date'));
  assert.equal(date({ date: '2028-02-29' }, 'date').toISOString().slice(0, 10), '2028-02-29');
});
test('integer business fields accept whole values and reject fractional or out-of-range levels', () => {
  assert.equal(dec({ level: '2' }, 'level', '1', '1', '9', 0).toString(), '2');
  assert.equal(dec({}, 'level', '1', '1', '9', 0).toString(), '1');
  for (const level of ['1.5', '0', '10', '1e1'])
    assert.throws(() => dec({ level }, 'level', '1', '1', '9', 0));
});
