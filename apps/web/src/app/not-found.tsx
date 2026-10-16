import { serverLanguage } from '@/lib/i18n-server';
import Link from 'next/link';
export default async function NotFound() {
  const { t, locale } = await serverLanguage();

  return (
    <section className="empty-state">
      <h1>{t('页面不存在')}</h1>
      <p>{t('请从工作台选择可用模块。')}</p>
      <Link href="/">{t('返回工作台')}</Link>
    </section>
  );
}
