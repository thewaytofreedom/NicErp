import { sameOrigin } from '@/lib/csrf';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { backend, COMPANY_COOKIE } from '@/lib/api';
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ message: '请求来源无效' }, { status: 403 });
  try {
    const { companyId } = await req.json();
    if (typeof companyId !== 'string' || !/^[0-9a-f-]{36}$/.test(companyId))
      return NextResponse.json({ message: '公司无效' }, { status: 400 });
    const r = await backend('auth/me', {}, companyId);
    if (!r.ok) return NextResponse.json({ message: '没有该公司的访问权限' }, { status: r.status });
    (await cookies()).set(COMPANY_COOKIE, companyId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: '切换失败，请重试' }, { status: 503 });
  }
}
