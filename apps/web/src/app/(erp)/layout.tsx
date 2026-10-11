import { currentUser } from '@/lib/api';
import Shell from '@/components/shell';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  return <Shell me={me}>{children}</Shell>;
}
