'use client';
import { useLanguage } from '@/components/locale-provider';
import { useState } from 'react';
import { request } from '@/lib/client';
export default function Login({ needsSetup }: { needsSetup: boolean }) {
  const { t } = useLanguage();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await request(needsSetup ? 'auth/setup' : 'auth/login', 'POST', body);
      window.location.assign('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <div className="login-intro">
        <p className="eyebrow">NICERP / WORKSPACE</p>
        <h1>
          {t('让每一笔业务')}
          <br />
          {t('都有清晰的来路。')}
        </h1>
        <p>
          {t('产品、订单、库存与资金，')}
          <br />
          {t('在同一工作空间中有序协作。')}
        </p>
      </div>
      <form className="login-card" method="post" onSubmit={submit}>
        <h2>{needsSetup ? t('初始化企业空间') : t('登录 NicErp')}</h2>
        <p className="subtitle">
          {needsSetup ? t('创建公司与首位管理员，开始使用系统。') : t('使用你的企业账号继续工作。')}
        </p>
        {needsSetup && (
          <>
            <label>
              {t('公司名称')}
              <input
                name="companyName"
                required
                defaultValue={t('NicErp 演示公司')}
                maxLength={200}
              />
            </label>
            <label>
              {t('本位币')}
              <select name="currency" defaultValue="SGD">
                {['SGD', 'CNY', 'USD', 'EUR', 'MYR', 'HKD'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              {t('管理员姓名')}
              <input name="name" required autoComplete="name" maxLength={200} />
            </label>
          </>
        )}
        <label>
          {t('邮箱')}
          <input name="email" required type="email" autoComplete="username" maxLength={254} />
        </label>
        <label>
          {t('密码')}
          <input
            name="password"
            required
            type="password"
            minLength={needsSetup ? 12 : 1}
            maxLength={128}
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
          />
          {needsSetup && <small>{t('至少 12 个字符')}</small>}
        </label>
        {error && (
          <p className="error" role="alert">
            {t(error)}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? t('正在处理…') : needsSetup ? t('创建并进入') : t('登录')}
        </button>
      </form>
    </div>
  );
}
