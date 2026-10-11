import { sameOrigin } from '@/lib/csrf';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { backend, SESSION_COOKIE, COMPANY_COOKIE } from '@/lib/api';
async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!['auth', 'erp'].includes(path[0]) || path.some((s) => !s || s === '.' || s === '..'))
    return NextResponse.json({ message: '无效请求' }, { status: 400 });
  if (req.method !== 'GET' && !sameOrigin(req))
    return NextResponse.json({ message: '请求来源无效' }, { status: 403 });
  try {
    const route = path.map(encodeURIComponent).join('/'),
      raw = req.method === 'GET' ? undefined : await req.text();
    if (raw && raw.length > 1000000)
      return NextResponse.json({ message: '请求内容过大' }, { status: 413 });
    const response = await backend(route + req.nextUrl.search, {
      method: req.method,
      body: raw || undefined,
    });
    const data = await response.json();
    const jar = await cookies();
    if (response.ok && ['auth/login', 'auth/setup'].includes(route)) {
      jar.set(SESSION_COOKIE, data.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 8 * 60 * 60,
      });
      jar.delete(COMPANY_COOKIE);
      return NextResponse.json({ ok: true });
    }
    if (
      response.status === 401 ||
      route === 'auth/logout' ||
      (route === 'auth/password' && response.ok)
    ) {
      jar.delete(SESSION_COOKIE);
      jar.delete(COMPANY_COOKIE);
    }
    return NextResponse.json(data, {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ message: '无法连接业务服务，请稍后重试' }, { status: 503 });
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
