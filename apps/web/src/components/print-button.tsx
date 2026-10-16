'use client';
import { useLanguage } from '@/components/locale-provider';
export default function PrintButton() {
  const { t } = useLanguage();
  return (
    <button className="primary no-print" onClick={() => window.print()}>
      {t('打印 / 保存为 PDF')}
    </button>
  );
}
