import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HealthController } from '../dist/health/health.controller.js';
import { readConfig } from '../dist/config.js';
test('readiness succeeds when the database responds', async () => {
  const health = new HealthController({ $queryRaw: async () => [{ '?column?': 1 }] });
  assert.equal((await health.ready()).database, 'connected');
});
test('database failure returns 503 without leaking connection details', async () => {
  const health = new HealthController({
    $queryRaw: async () => {
      throw new Error('secret connection string');
    },
  });
  await assert.rejects(
    () => health.ready(),
    (error) => error.getStatus() === 503 && !JSON.stringify(error.getResponse()).includes('secret'),
  );
  assert.equal(health.live().status, 'ok');
});
test('invalid database and port configuration fail fast', () => {
  assert.throws(() => readConfig({}), /DATABASE_URL/);
  assert.throws(
    () => readConfig({ DATABASE_URL: 'postgresql://localhost/test', PORT: 'bad' }),
    /PORT/,
  );
});
