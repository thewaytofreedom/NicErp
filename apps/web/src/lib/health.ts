import 'server-only';
export async function getHealth() {
  const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  async function check(path: string) {
    try {
      const response = await fetch(`${base}/api/v1/health${path}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(3500),
      });
      const body = await response.json();
      return response.ok && body.status === 'ok';
    } catch {
      return false;
    }
  }
  const [api, database] = await Promise.all([check(''), check('/ready')]);
  return { api, database };
}
