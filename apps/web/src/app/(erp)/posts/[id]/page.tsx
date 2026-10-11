import { backend } from '@/lib/api';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await backend(`erp/posts/${encodeURIComponent(id)}`);
  if (r.status === 404) notFound();
  if (!r.ok) throw Error();
  const p = await r.json();
  return (
    <article className="panel content-preview">
      <p className="eyebrow">内容预览 · 仅后台可见</p>
      <h1>{p.title}</h1>
      <p className="subtitle">{p.excerpt}</p>
      {p.coverUrl && (
        <p>
          <a href={p.coverUrl} target="_blank" rel="noreferrer">
            查看封面图片
          </a>
        </p>
      )}
      <div className="preserve">{p.content}</div>
    </article>
  );
}
