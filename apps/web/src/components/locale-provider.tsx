'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translator, formatMoney, type Locale } from '@/lib/i18n';

const LanguageContext = createContext({
  locale: 'zh-CN' as Locale,
  t: translator('zh-CN'),
  money: (value: unknown) => formatMoney(value),
  price: (value: unknown) => formatMoney(value, 'zh-CN', 4),
  applyLocale: (_locale: Locale) => {},
});
export default function LocaleProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);
  useEffect(() => setLocale(initialLocale), [initialLocale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `nicerp_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [locale]);
  const value = useMemo(
    () => ({
      locale,
      t: translator(locale),
      money: (value: unknown) => formatMoney(value, locale),
      price: (value: unknown) => formatMoney(value, locale, 4),
      applyLocale: (next: Locale) => {
        setLocale(next);
        document.cookie = `nicerp_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      },
    }),
    [locale],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  return useContext(LanguageContext);
}
