import { serverLanguage } from '@/lib/i18n-server';
import { notFound } from 'next/navigation';
import { modules } from '@/lib/modules';
import { currentUser } from '@/lib/api';
import Workspace from '@/components/workspace';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    tab?: string;
  }>;
}) {
  const { t, locale } = await serverLanguage();

  const { slug } = await params;
  const module = modules.find((m) => m.slug === slug);
  if (!module) notFound();
  const me = await currentUser();
  if ((module.adminOnly && me.role !== 'ADMIN') || (module.roles && !module.roles.includes(me.role)))
    notFound();
  const { tab } = await searchParams;
  return (
    <>
      <p className="eyebrow">BUSINESS WORKSPACE / {module.code}</p>
      <h1>{t(module.title)}</h1>
      <p className="subtitle">{t(module.description)}</p>
      <Workspace key={slug} slug={slug} role={me.role} initialTab={Math.max(0, Number(tab) || 0)} />
    </>
  );
}
