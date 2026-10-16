import assert from 'node:assert/strict';

export async function runLanguage({ call, companyB, viewerToken, email, password, pass }) {
  assert.equal((await call('auth/me')).locale, 'zh-CN');
  assert.equal((await call('auth/preferences', 'PATCH', { locale: 'en' })).locale, 'en');
  assert.equal((await call('auth/me')).locale, 'en');
  assert.equal((await call('auth/me', 'GET', undefined, { companyId: companyB.id })).locale, 'en');
  const login = await call('auth/login', 'POST', { email, password });
  assert.equal((await call('auth/me', 'GET', undefined, { token: login.token })).locale, 'en');
  assert.equal((await call('auth/me', 'GET', undefined, { token: viewerToken })).locale, 'zh-CN');
  for (const locale of ['fr', '', null, 7]) {
    await call('auth/preferences', 'PATCH', { locale }, { status: 400 });
    assert.equal((await call('auth/me')).locale, 'en');
  }
  const admin = await call('auth/me');
  await call(
    'auth/preferences',
    'PATCH',
    { locale: 'en', userId: admin.id },
    { token: viewerToken },
  );
  await call('auth/preferences', 'PATCH', { locale: 'zh-CN' });
  assert.equal((await call('auth/me', 'GET', undefined, { token: viewerToken })).locale, 'en');
  assert.equal((await call('auth/me')).locale, 'zh-CN');
  await call('auth/preferences', 'PATCH', { locale: 'zh-CN' }, { token: viewerToken });
  await call('auth/preferences', 'PATCH', { locale: 'en' }, { token: '', status: 401 });
  await call('auth/logout', 'POST', {}, { token: login.token });
  pass(
    'user language defaults, self-service settings, validation, account isolation, company switching and new-session persistence',
  );
}
