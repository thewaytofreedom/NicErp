import { notFound } from 'next/navigation';
import { modules } from '@/lib/modules';
import Workspace from '@/components/workspace';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const module = modules.find((m) => m.slug === slug);
  if (!module) notFound();
  const { tab } = await searchParams;
  return (
    <>
      <p className="eyebrow">BUSINESS WORKSPACE / {module.code}</p>
      <h1>{module.title}</h1>
      <p className="subtitle">{module.description}</p>
      <Workspace key={slug} slug={slug} initialTab={Math.max(0, Math.min(3, Number(tab) || 0))} />
    </>
  );
}
