import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DriverAdapterError } from '@prisma/driver-adapter-utils';
import { atomic } from '../dist/database/transaction.js';

const conflicts = [
  ['Prisma P2034', Object.assign(new Error('write conflict'), { code: 'P2034' })],
  [
    'PostgreSQL serialization failure',
    new DriverAdapterError({ kind: 'TransactionWriteConflict', originalCode: '40001' }),
  ],
  [
    'PostgreSQL deadlock',
    new DriverAdapterError({ kind: 'TransactionWriteConflict', originalCode: '40P01' }),
  ],
];
for (const [name, error] of conflicts) {
  test(`atomic retries ${name} with a fresh transaction`, async () => {
    let attempts = 0;
    const db = {
      $transaction: async (work, options) => {
        assert.equal(options.isolationLevel, 'Serializable');
        if (++attempts === 1) throw error;
        return work({});
      },
    };
    assert.equal(await atomic(db, async () => 'committed'), 'committed');
    assert.equal(attempts, 2);
  });
}
test('atomic returns 409 after bounded conflict retries', async () => {
  let attempts = 0;
  const db = {
    $transaction: async () => {
      attempts++;
      throw conflicts[1][1];
    },
  };
  await assert.rejects(
    atomic(db, async () => {}),
    (error) => error.getStatus() === 409,
  );
  assert.equal(attempts, 4);
});
test('atomic does not retry business or unrelated database errors', async () => {
  for (const error of [
    new Error('business rejection'),
    new DriverAdapterError({ kind: 'TableDoesNotExist', table: 'missing' }),
  ]) {
    let attempts = 0;
    const db = {
      $transaction: async () => {
        attempts++;
        throw error;
      },
    };
    await assert.rejects(
      atomic(db, async () => {}),
      (received) => received === error,
    );
    assert.equal(attempts, 1);
  }
});
