'use client';
import { useLanguage } from '@/components/locale-provider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Layers3, LayoutDashboard, LogOut } from 'lucide-react';
import { modules } from '@/lib/modules';
import { request, labels } from '@/lib/client';
import type { Me } from '@/lib/api';
export default function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const { t } = useLanguage();
  const path = usePathname(),
    [error, setError] = useState('');
  async function switchCompany(companyId: string) {
    setError('');
    try {
      const r = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      if (!r.ok) throw Error(t('公司切换失败'));
      window.location.assign('/');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Layers3 size={23} />
          </span>
          NicErp<span className="brand-dot">.</span>
        </Link>
        <div className="workspace">
          <div>
            <small>{t('当前公司')}</small>
            <select
              aria-label={t('切换公司')}
              value={me.companyId}
              onChange={(e) => switchCompany(e.target.value)}
            >
              {me.memberships.map((m) => (
                <option key={m.company.id} value={m.company.id}>
                  {m.company.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <nav aria-label={t('主导航')}>
          <p className="nav-label">{t('工作空间')}</p>
          <Link href="/" className={path === '/' ? 'active' : ''}>
            <LayoutDashboard size={18} />
            {t('管理工作台')}
          </Link>
          <p className="nav-label">{t('业务模块')}</p>
          {modules.filter((m) => (!m.adminOnly || me.role === 'ADMIN') && (!m.roles || m.roles.includes(me.role))).map((m) => (
            <Link
              key={m.slug}
              href={`/modules/${m.slug}`}
              className={path.includes(`/modules/${m.slug}`) ? 'active' : ''}
            >
              <span className="nav-number">{m.code}</span>
              {t(m.title)}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="dot" />
          NicErp v0.2.0<small>{t('业务管理工作空间')}</small>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>{me.memberships.find((m) => m.company.id === me.companyId)?.company.name}</span>
          <div className="user-menu">
            <Link href="/modules/settings?tab=4">{t('用户设置')}</Link>
            <span>
              {me.name} · {t(labels[me.role])}
            </span>
            <button
              className="icon-button"
              title={t('退出登录')}
              onClick={async () => {
                try {
                  await request('auth/logout', 'POST', {});
                  window.location.assign('/login');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        {error && (
          <p className="error" role="alert">
            {t(error)}
          </p>
        )}
        <main>{children}</main>
        <footer>
          {t('NicErp 企业资源管理平台')}
          <span>{t('业务与数据，在此连接')}</span>
        </footer>
      </div>
    </div>
  );
}
