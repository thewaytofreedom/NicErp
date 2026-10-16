import english from './translations/en.json';

export const locales = ['zh-CN', 'en'] as const;
export type Locale = (typeof locales)[number];
export type Variables = Record<string, string | number | null | undefined>;
const messages: Record<string, string> = english;
export function validLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'zh-CN';
}
const interpolate = (source: string, values: Variables) =>
  source.replace(/\{(\w+)\}/g, (token, key: string) => String(values[key] ?? token));
const patterns = Object.entries(messages)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([key, value]) => {
    const keys: string[] = [];
    const regex = key
      .split(/(\{\d+\})/)
      .map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          keys.push(part.slice(1, -1));
          return '([\\s\\S]*?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return { regex: new RegExp(`^${regex}$`), keys, value };
  });
export function translate(locale: Locale, source: string, values: Variables = {}): string {
  if (locale === 'zh-CN') return interpolate(source, values);
  if (messages[source]) return interpolate(messages[source], values);
  for (const pattern of patterns) {
    const match = pattern.regex.exec(source);
    if (match)
      return interpolate(
        pattern.value,
        Object.fromEntries(pattern.keys.map((key, i) => [key, translate(locale, match[i + 1])])),
      );
  }
  return interpolate(source, values);
}
export function translator(locale: Locale) {
  return (source: string, values?: Variables) => translate(locale, source, values);
}
export function formatMoney(value: unknown, locale: Locale = 'zh-CN', decimals = 2) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-SG' : 'zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(Number(value ?? 0));
}
