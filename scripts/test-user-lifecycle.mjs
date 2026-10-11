import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

export async function runUserLifecycle({ call, db, companyId, companyB, adminId, pass }) {
  const password = 'Lifecycle-' + randomUUID();
  let currentPassword = password;
  const email = 'lifecycle@nicerp.test';
  const user = await call('erp/users', 'POST', {
    name: '启停测试',
    email,
    password,
    role: 'MANAGER',
  });
  const login = () => call('auth/login', 'POST', { email, password: currentPassword });
  const first = await login();
  const second = await login();
  await call(`erp/users/${user.id}`, 'PATCH', { active: 'false' }, { status: 400 });
  await call(
    `erp/users/${user.id}`,
    'PATCH',
    { active: false },
    { token: first.token, status: 403 },
  );
  await call(
    `erp/users/${user.id}`,
    'PATCH',
    { active: false },
    { companyId: companyB.id, status: 404 },
  );
  const [loginAttempt, disableAttempt] = await Promise.allSettled([
    login(),
    call(`erp/users/${user.id}`, 'PATCH', { active: false }),
  ]);
  assert.equal(disableAttempt.status, 'fulfilled', disableAttempt.reason?.message);
  if (loginAttempt.status === 'rejected')
    assert.ok([401, 409].includes(loginAttempt.reason.actual), loginAttempt.reason.message);
  assert.equal((await call('erp/users')).rows.find((r) => r.id === user.id).active, false);
  assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
  for (const token of [first.token, second.token]) {
    await call('auth/me', 'GET', undefined, { token, status: 401 });
    await call('erp/products', 'GET', undefined, { token, status: 401 });
    await call(
      'erp/products',
      'POST',
      { sku: 'DISABLED', name: '禁止写入' },
      { token, status: 401 },
    );
  }
  await call('auth/login', 'POST', { email, password }, { status: 401 });
  await call(`erp/users/${user.id}`, 'PATCH', { role: 'VIEWER' });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).active, false);
  await call(`erp/users/${user.id}`, 'PATCH', { active: true });
  await call('auth/me', 'GET', undefined, { token: first.token, status: 401 });
  const enabled = await login();
  await call('erp/products', 'GET', undefined, { token: enabled.token });
  pass(
    'disable revokes all sessions, blocks login, preserves omitted fields and requires a new login after enable',
  );

  await call(`erp/users/${user.id}`, 'PATCH', { role: 'SALES' });
  await call(
    'erp/products',
    'POST',
    { sku: 'LIVE-ROLE', name: '即时权限测试' },
    { token: enabled.token },
  );
  await call(`erp/users/${user.id}`, 'PATCH', { role: 'VIEWER' });
  await call(
    'erp/products',
    'POST',
    { sku: 'ROLE-DENIED', name: '禁止写入' },
    { token: enabled.token, status: 403 },
  );
  assert.equal((await call('auth/me', 'GET', undefined, { token: enabled.token })).role, 'VIEWER');
  const loggedOut = await login();
  await call('auth/logout', 'POST', {}, { token: loggedOut.token });
  await call('auth/me', 'GET', undefined, { token: loggedOut.token, status: 401 });
  await call('auth/me', 'GET', undefined, { token: enabled.token });
  const expired = await login();
  await db.session.update({
    where: { id: createHash('sha256').update(expired.token).digest('hex') },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await call('auth/me', 'GET', undefined, { token: expired.token, status: 401 });
  const passwordSession = await login();
  currentPassword = password + '-changed';
  await call(
    'auth/password',
    'POST',
    { oldPassword: password, password: currentPassword },
    { token: enabled.token },
  );
  for (const token of [enabled.token, passwordSession.token])
    await call('auth/me', 'GET', undefined, { token, status: 401 });
  assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
  await call('auth/login', 'POST', { email, password }, { status: 401 });
  const afterPassword = await login();
  pass('logout isolates sessions, expiry rejects access and password changes revoke every session');
  await call(`erp/users/${user.id}`, 'DELETE');
  await call('auth/me', 'GET', undefined, { token: afterPassword.token, status: 401 });
  pass('role changes and removed company access apply immediately to existing sessions');

  const inactive = await call('erp/users', 'POST', {
    name: '停用管理员',
    email: 'inactive-admin@nicerp.test',
    password,
    role: 'ADMIN',
    active: false,
  });
  await call(
    'auth/login',
    'POST',
    { email: 'inactive-admin@nicerp.test', password },
    { status: 401 },
  );
  await call(`erp/users/${adminId}`, 'PATCH', { active: false }, { status: 409 });
  await call(`erp/users/${adminId}`, 'PATCH', { role: 'VIEWER' }, { status: 409 });
  await call(`erp/users/${adminId}`, 'DELETE', undefined, { status: 409 });
  await call(`erp/users/${inactive.id}`, 'DELETE');
  await call('auth/me');
  pass('inactive administrators cannot satisfy the last active administrator constraint');

  const shared = await call('erp/users', 'POST', {
    name: '跨公司账号',
    email: 'shared-lifecycle@nicerp.test',
    password,
    role: 'VIEWER',
  });
  await call(
    'erp/users',
    'POST',
    {
      email: 'shared-lifecycle@nicerp.test',
      role: 'VIEWER',
    },
    { companyId: companyB.id },
  );
  const localAdmin = await call('erp/users', 'POST', {
    name: '本公司管理员',
    email: 'local-admin@nicerp.test',
    password,
    role: 'ADMIN',
  });
  const localSession = await call('auth/login', 'POST', {
    email: 'local-admin@nicerp.test',
    password,
  });
  await call(
    `erp/users/${shared.id}`,
    'PATCH',
    { active: false },
    { token: localSession.token, status: 403 },
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: shared.id } })).active, true);
  await call(`erp/users/${shared.id}`, 'PATCH', { role: 'SALES' }, { token: localSession.token });
  const sharedSession = await call('auth/login', 'POST', {
    email: 'shared-lifecycle@nicerp.test',
    password,
  });
  await call('auth/me', 'GET', undefined, { token: sharedSession.token, companyId: companyB.id });
  await call(`erp/users/${shared.id}`, 'PATCH', { active: false });
  for (const selectedCompany of [companyId, companyB.id])
    await call('auth/me', 'GET', undefined, {
      token: sharedSession.token,
      companyId: selectedCompany,
      status: 401,
    });
  await call(
    `erp/users/${shared.id}`,
    'PATCH',
    { active: true },
    { token: localSession.token, status: 403 },
  );
  await call(
    'erp/users',
    'POST',
    {
      email: 'shared-lifecycle@nicerp.test',
      role: 'VIEWER',
      active: true,
    },
    { companyId: companyB.id, status: 409 },
  );
  await call(`erp/users/${shared.id}`, 'PATCH', { active: true });
  await call('auth/me', 'GET', undefined, { token: sharedSession.token, status: 401 });
  await call(
    'erp/users',
    'POST',
    {
      email: 'local-admin@nicerp.test',
      role: 'ADMIN',
    },
    { companyId: companyB.id },
  );
  await call(`erp/users/${adminId}`, 'PATCH', { role: 'VIEWER' }, { companyId: companyB.id });
  await call(
    `erp/users/${localAdmin.id}`,
    'PATCH',
    { active: false },
    { token: localSession.token, status: 409 },
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: localAdmin.id } })).active, true);
  await call(
    `erp/users/${adminId}`,
    'PATCH',
    { role: 'ADMIN' },
    { companyId: companyB.id, token: localSession.token },
  );
  pass(
    'shared account changes require all-company administration and protect administrators in every company',
  );

  const racers = await Promise.all(
    ['one', 'two'].map((suffix) =>
      call('erp/users', 'POST', {
        name: '并发管理员',
        email: `race-${suffix}@nicerp.test`,
        password,
        role: 'ADMIN',
      }),
    ),
  );
  const raceLogins = await Promise.all(
    racers.map(async (r) => {
      const account = await db.user.findUniqueOrThrow({ where: { id: r.id } });
      return call('auth/login', 'POST', { email: account.email, password });
    }),
  );
  await call(`erp/users/${localAdmin.id}`, 'PATCH', { role: 'VIEWER' });
  await call(`erp/users/${adminId}`, 'PATCH', { role: 'VIEWER' });
  const attempts = await Promise.allSettled(
    racers.map((r, i) =>
      call(`erp/users/${r.id}`, 'PATCH', { active: false }, { token: raceLogins[i].token }),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  for (const attempt of attempts)
    if (attempt.status === 'rejected')
      assert.equal(attempt.reason.actual, 409, attempt.reason.message);
  assert.equal(
    await db.membership.count({ where: { companyId, role: 'ADMIN', user: { active: true } } }),
    1,
  );
  const remaining = racers.find((r) => attempts[racers.indexOf(r)].status === 'rejected');
  const remainingEmail = (await db.user.findUniqueOrThrow({ where: { id: remaining.id } })).email;
  const remainingLogin = await call('auth/login', 'POST', { email: remainingEmail, password });
  await call(`erp/users/${adminId}`, 'PATCH', { role: 'ADMIN' }, { token: remainingLogin.token });
  for (const r of racers) await call(`erp/users/${r.id}`, 'DELETE');
  const audits = await db.auditLog.findMany({
    where: { companyId, resource: 'users', recordId: shared.id },
  });
  assert.ok(audits.some((a) => a.action === 'DISABLE'));
  assert.ok(audits.some((a) => a.action === 'ENABLE'));
  pass(
    'concurrent disable preserves an active administrator and account state changes are audited',
  );
}
