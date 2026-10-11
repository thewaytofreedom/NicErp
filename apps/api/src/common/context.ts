import { ForbiddenException } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';
export interface Context {
  userId: string;
  name: string;
  companyId: string;
  role: Role;
  sessionId: string;
}
export interface AppRequest {
  headers: Record<string, string | undefined>;
  ip: string;
  auth: Context;
}
export function permit(c: Context, area: string) {
  const permissions: Record<string, string[]> = {
    catalog: ['MANAGER', 'SALES', 'PURCHASING'],
    partners: ['MANAGER', 'SALES', 'PURCHASING'],
    sales: ['MANAGER', 'SALES'],
    purchasing: ['MANAGER', 'PURCHASING'],
    inventory: ['MANAGER', 'WAREHOUSE'],
    finance: ['MANAGER', 'FINANCE'],
    content: ['MANAGER'],
    settings: [],
  };
  if (c.role !== 'ADMIN' && !permissions[area]?.includes(c.role))
    throw new ForbiddenException('当前角色没有此操作权限');
}
export function documentArea(kind: string) {
  return ['INVOICE', 'BILL'].includes(kind)
    ? 'finance'
    : kind === 'PURCHASE'
      ? 'purchasing'
      : 'sales';
}
