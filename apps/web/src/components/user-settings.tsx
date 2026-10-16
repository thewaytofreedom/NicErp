'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { request } from '@/lib/client';
import { validLocale, type Locale } from '@/lib/i18n';
import { useLanguage } from './locale-provider';
import { ErrorMessage } from './ui';

export default function UserSettings() {
  const { locale, t, applyLocale } = useLanguage();
  const [selected, setSelected] = useState<Locale>(locale);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const router = useRouter();
  return (
    <form
      className="panel compact"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setSaved(false);
        try {
          const result = await request<{ locale: Locale }>('auth/preferences', 'PATCH', {
            locale: selected,
          });
          applyLocale(result.locale);
          setSaved(true);
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{t('用户设置')}</h2>
      <p>{t('选择中文或英文，仅影响你自己的界面显示。')}</p>
      <label>
        {t('显示语言')}
        <select
          aria-label={t('显示语言')}
          value={selected}
          disabled={busy}
          onChange={(event) => {
            setSelected(validLocale(event.target.value));
            setSaved(false);
          }}
        >
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <p className="hint">{t('保存后立即生效，重新登录或切换公司后仍会保留。')}</p>
      <ErrorMessage error={error} />
      {saved && (
        <p className="success" role="status">
          {t('语言设置已保存')}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {t(busy ? '保存中…' : '保存设置')}
      </button>
    </form>
  );
}
