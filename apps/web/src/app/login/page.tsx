import { serverLanguage } from '@/lib/i18n-server';
import Login from '@/components/login';
import { backend } from '@/lib/api';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  const { t, locale } = await serverLanguage();

  try {
    const r = await backend('auth/status');
    if (!r.ok) throw Error();
    const data = await r.json();
    return <Login needsSetup={data.needsSetup} />;
  } catch {
    return (
      <div className="empty-state">
        <h1>{t('暂时无法连接服务')}</h1>
        <p>{t('请确认后端和数据库已启动，再刷新页面。')}</p>
      </div>
    );
  }
}
