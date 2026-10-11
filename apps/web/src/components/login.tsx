'use client';
import { useState } from 'react';
import { request } from '@/lib/client';
export default function Login({ needsSetup }: { needsSetup: boolean }) {
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
          让每一笔业务
          <br />
          都有清晰的来路。
        </h1>
        <p>
          产品、订单、库存与资金，
          <br />
          在同一工作空间中有序协作。
        </p>
      </div>
      <form className="login-card" method="post" onSubmit={submit}>
        <h2>{needsSetup ? '初始化企业空间' : '登录 NicErp'}</h2>
        <p className="subtitle">
          {needsSetup ? '创建公司与首位管理员，开始使用系统。' : '使用你的企业账号继续工作。'}
        </p>
        {needsSetup && (
          <>
            <label>
              公司名称
              <input name="companyName" required defaultValue="NicErp 演示公司" maxLength={200} />
            </label>
            <label>
              本位币
              <select name="currency" defaultValue="SGD">
                {['SGD', 'CNY', 'USD', 'EUR', 'MYR', 'HKD'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              管理员姓名
              <input name="name" required autoComplete="name" maxLength={200} />
            </label>
          </>
        )}
        <label>
          邮箱
          <input name="email" required type="email" autoComplete="username" maxLength={254} />
        </label>
        <label>
          密码
          <input
            name="password"
            required
            type="password"
            minLength={needsSetup ? 12 : 1}
            maxLength={128}
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
          />
          {needsSetup && <small>至少 12 个字符</small>}
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? '正在处理…' : needsSetup ? '创建并进入' : '登录'}
        </button>
      </form>
    </div>
  );
}
