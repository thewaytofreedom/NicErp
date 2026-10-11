import assert from 'node:assert/strict';
const api = process.env.SMOKE_API_URL ?? 'http://127.0.0.1:3001';
const web = process.env.SMOKE_WEB_URL ?? 'http://127.0.0.1:3000';
const get = (url) => fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual' });
for (const path of ['/api/v1/health', '/api/v1/health/ready']) {
  const r = await get(api + path);
  assert.equal(r.status, 200, path);
  assert.equal((await r.json()).status, 'ok');
}
assert.equal((await get(api + '/api/v1/erp/bootstrap')).status, 401);
const home = await get(web);
assert.equal(home.status, 307);
assert.equal(home.headers.get('location'), '/login');
assert.equal((await get(web + '/login')).status, 200);
assert.equal((await get(api + '/api/v1/auth/status')).status, 200);
console.log(
  'PASS: API, PostgreSQL, unauthenticated API protection, login redirect and setup status',
);
