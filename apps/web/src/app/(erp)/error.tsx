'use client';
import { useLanguage } from '@/components/locale-provider';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="empty-state">
      <h2>{t('暂时无法加载数据')}</h2>
      <p>{t('请检查服务连接后重试。')}</p>
      <button onClick={reset}>{t('重试')}</button>
    </div>
  );
}
