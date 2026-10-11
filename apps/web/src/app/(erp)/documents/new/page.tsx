import { backend } from '@/lib/api';
import DocumentEditor from '@/components/document-editor';
import { notFound } from 'next/navigation';
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const kind = (await searchParams).kind ?? 'QUOTE';
  if (!['QUOTE', 'SALE', 'PURCHASE', 'INVOICE', 'BILL'].includes(kind)) notFound();
  const r = await backend('erp/bootstrap');
  if (!r.ok) throw Error();
  return <DocumentEditor boot={await r.json()} kind={kind} />;
}
