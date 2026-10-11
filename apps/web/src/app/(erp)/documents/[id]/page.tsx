import { backend } from '@/lib/api';
import DocumentView from '@/components/document-view';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, b] = await Promise.all([
    backend(`erp/documents/${encodeURIComponent(id)}`),
    backend('erp/bootstrap'),
  ]);
  if (d.status === 404 || d.status === 400) notFound();
  if (!d.ok || !b.ok) throw Error();
  return <DocumentView doc={await d.json()} boot={await b.json()} />;
}
