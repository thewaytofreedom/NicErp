import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
export type Input = Record<string, unknown>;
export function object(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('请输入有效的数据对象');
  return value as Input;
}
export function str(b: Input, key: string, max = 200, fallback?: string): string {
  const v = b[key] ?? fallback;
  if (typeof v !== 'string' || v.length > max || (fallback === undefined && !v.trim()))
    throw new BadRequestException(`${key} 必填且不超过 ${max} 个字符`);
  return v.trim();
}
export function choice<T extends string>(
  b: Input,
  key: string,
  values: readonly T[],
  fallback?: T,
): T {
  const v = str(b, key, 100, fallback);
  if (!values.includes(v as T)) throw new BadRequestException(`${key} 的选项无效`);
  return v as T;
}
export function bool(b: Input, key: string, fallback = false) {
  const v = b[key] ?? fallback;
  if (typeof v !== 'boolean') throw new BadRequestException(`${key} 必须是布尔值`);
  return v;
}
export function id(b: Input, key: string, optional = false) {
  const v = str(b, key, 36, optional ? '' : undefined);
  if (!v && optional) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
    throw new BadRequestException(`${key} 标识无效`);
  return v;
}
export function dec(
  b: Input,
  key: string,
  fallback = '0',
  min = '0',
  max = '999999999999',
  scale = 4,
) {
  const v = b[key] ?? fallback;
  if (
    !['string', 'number'].includes(typeof v) ||
    !new RegExp(scale === 0 ? '^-?\\d{1,12}$' : `^-?\\d{1,12}(\\.\\d{1,${scale}})?$`).test(
      String(v),
    )
  )
    throw new BadRequestException(`${key} 必须是最多 ${scale} 位小数的数值`);
  const d = new Prisma.Decimal(String(v));
  if (d.lt(min) || d.gt(max)) throw new BadRequestException(`${key} 超出允许范围`);
  return d;
}
export function list(b: Input, key: string, max = 100): unknown[] {
  const v = b[key] ?? [];
  if (!Array.isArray(v) || v.length > max)
    throw new BadRequestException(`${key} 最多允许 ${max} 项`);
  return v;
}
export function strings(b: Input, key: string, max = 100) {
  return [...new Set(list(b, key, max).map((v) => str({ v }, 'v', 2000)))];
}
export function currency(b: Input, key = 'currency', fallback = 'SGD') {
  const v = str(b, key, 3, fallback).toUpperCase();
  if (!/^[A-Z]{3}$/.test(v)) throw new BadRequestException('币种必须为三位代码');
  return v;
}
export function date(b: Input, key: string, optional = false): Date | undefined {
  const v = str(b, key, 10, optional ? '' : undefined);
  if (!v && optional) return undefined;
  const d = new Date(v + 'T00:00:00.000Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== v
  )
    throw new BadRequestException(`${key} 日期无效`);
  return d;
}
export function email(b: Input, key = 'email', optional = false) {
  const v = str(b, key, 254, optional ? '' : undefined).toLowerCase();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new BadRequestException('邮箱格式无效');
  return v;
}
export function url(value: unknown) {
  if (value === '') return '';
  const v = str({ value }, 'value', 2000);
  try {
    const u = new URL(v);
    if (!['http:', 'https:'].includes(u.protocol)) throw Error();
  } catch {
    throw new BadRequestException('图片链接仅支持 http/https');
  }
  return v;
}
export function password(b: Input, key = 'password') {
  const v = b[key];
  if (typeof v !== 'string' || v.length < 12 || v.length > 128)
    throw new BadRequestException('密码长度须为 12–128 个字符');
  return v;
}
export const roles = [
  'ADMIN',
  'MANAGER',
  'SALES',
  'PURCHASING',
  'WAREHOUSE',
  'FINANCE',
  'VIEWER',
] as const;
export const kinds = ['QUOTE', 'SALE', 'PURCHASE', 'INVOICE', 'BILL'] as const;
export type Kind = (typeof kinds)[number];
