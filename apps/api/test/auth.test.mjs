import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService, hashPassword } from '../dist/auth/auth.service.js';

for (const change of ['disable', 'password']) {
  test(`login cannot create a session after concurrent ${change}`, async () => {
    const password = 'Concurrent-login-password';
    const user = { id: 'test-user', active: true, passwordHash: await hashPassword(password) };
    const current =
      change === 'disable'
        ? { ...user, active: false }
        : { ...user, passwordHash: await hashPassword('Changed-login-password') };
    let created = false;
    const tx = {
      user: { findUnique: async () => current },
      session: {
        create: async () => {
          created = true;
        },
      },
    };
    const auth = new AuthService({
      user: { findUnique: async () => user },
      session: { deleteMany: async () => ({ count: 0 }) },
      $transaction: async (work) => work(tx),
    });
    await assert.rejects(
      auth.login({ email: 'concurrent@nicerp.test', password }, '127.0.0.1'),
      (error) => error.getStatus() === 401,
    );
    assert.equal(created, false);
  });
}
