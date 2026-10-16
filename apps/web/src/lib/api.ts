import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
export const SESSION_COOKIE = 'nicerp_session';
export const COMPANY_COOKIE = 'nicerp_company';
export async function backend(path: string, init: RequestInit = {}, companyId?: string) {
  const jar = await cookies(),
    token = jar.get(SESSION_COOKIE)?.value,
    company = companyId ?? jar.get(COMPANY_COOKIE)?.value;
  return fetch(`${process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'}/api/v1/${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(company ? { 'x-company-id': company } : {}),
      ...init.headers,
    },
  });
}
export async function currentUser() {
  const response = await backend('auth/me');
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error('无法连接业务服务');
  return response.json() as Promise<Me>;
}
export interface Me {
  id: string;
  name: string;
  email: string;
  locale: 'zh-CN' | 'en';
  companyId: string;
  role: string;
  memberships: { role: string; company: { id: string; name: string; currency: string } }[];
}
