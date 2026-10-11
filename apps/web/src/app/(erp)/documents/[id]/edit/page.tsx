import { backend } from '@/lib/api';
import DocumentEditor from '@/components/document-editor';
import { notFound, redirect } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, b] = await Promise.all([
    backend(`erp/documents/${encodeURIComponent(id)}`),
    backend('erp/bootstrap'),
  ]);
  if (d.status === 404 || d.status === 400) notFound();
  if (!d.ok || !b.ok) throw Error();
  const doc = await d.json();
  if (doc.status !== 'DRAFT') redirect(`/documents/${id}`);
  return <DocumentEditor document={doc} boot={await b.json()} kind={doc.kind} />;
}
