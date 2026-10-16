import { backend } from '@/lib/api';
import PartnerProfile from '@/components/partner-profile';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, b] = await Promise.all([
    backend(`erp/partners/${encodeURIComponent(id)}/profile`),
    backend('erp/bootstrap'),
  ]);
  if (p.status === 404 || p.status === 400) notFound();
  if (!p.ok || !b.ok) throw Error();
  return <PartnerProfile profile={await p.json()} boot={await b.json()} />;
}
