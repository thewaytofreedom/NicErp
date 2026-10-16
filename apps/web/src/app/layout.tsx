import type { Metadata } from 'next';
import './globals.css';
import LocaleProvider from '@/components/locale-provider';
import { serverLanguage } from '@/lib/i18n-server';
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await serverLanguage();
  return {
    title: { default: t('NicErp · 企业管理'), template: '%s · NicErp' },
    robots: { index: false, follow: false },
  };
}
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { locale } = await serverLanguage();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
