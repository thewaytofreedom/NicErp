import Login from '@/components/login';
import { backend } from '@/lib/api';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  try {
    const r = await backend('auth/status');
    if (!r.ok) throw Error();
    const data = await r.json();
    return <Login needsSetup={data.needsSetup} />;
  } catch {
    return (
      <div className="empty-state">
        <h1>暂时无法连接服务</h1>
        <p>请确认后端和数据库已启动，再刷新页面。</p>
      </div>
    );
  }
}
