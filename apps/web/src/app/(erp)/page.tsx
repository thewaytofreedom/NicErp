import Link from 'next/link';
import { backend, currentUser } from '@/lib/api';
import { money, can, labels } from '@/lib/client';
import { modules } from '@/lib/modules';
export default async function Dashboard() {
  const me = await currentUser();
  const response = await backend('erp/dashboard');
  if (!response.ok) throw Error();
  const d = await response.json();
  const company = me.memberships.find((m) => m.company.id === me.companyId)!.company;
  return (
    <>
      <div className="heading">
        <div>
          <p className="eyebrow">WORKSPACE OVERVIEW</p>
          <h1>管理工作台</h1>
          <p className="subtitle">
            {company.name} · 汇总金额以本位币 {company.currency} 显示
          </p>
        </div>
        {can(me.role, 'sales') && (
          <Link className="button primary" href="/documents/new?kind=QUOTE">
            ＋ 新建报价
          </Link>
        )}
      </div>
      <section className="metric-grid">
        {[
          ['有效产品', d.products],
          ['往来单位', d.partners],
          ['待履约订单', d.openOrders],
          ['应收余额', money(d.receivable)],
          ['应付余额', money(d.payable)],
          ['已确认发票未税收入', money(d.sales)],
          ['参考毛利', money(d.margin)],
        ].map(([label, value]) => (
          <article className="status-card" key={label}>
            <small>{label}</small>
            <h2>{value}</h2>
          </article>
        ))}
      </section>
      <p className="hint">
        参考毛利按开票明细的参考成本快照计算，不代表实际库存成本核算结果。作废和草稿不计入金额。
      </p>
      <div className="section-heading">
        <h2>业务入口</h2>
      </div>
      <section className="module-grid">
        {modules.map((m) => (
          <Link className="module-card" key={m.slug} href={`/modules/${m.slug}`}>
            <span className="module-code">{m.code}</span>
            <h3>{m.title} →</h3>
            <p>{m.description}</p>
          </Link>
        ))}
      </section>
      <section className="panel activity">
        <h3>最近操作</h3>
        {d.recent.length ? (
          d.recent.map(
            (a: {
              id: string;
              actorName: string;
              action: string;
              resource: string;
              detail: string;
              createdAt: string;
            }) => (
              <div className="activity-row" key={a.id}>
                <span>
                  {a.actorName} · {labels[a.action] ?? a.action} ·{' '}
                  {labels[a.resource] ?? a.resource}
                </span>
                <span>{a.detail}</span>
                <small>{a.createdAt.replace('T', ' ').slice(0, 16)}</small>
              </div>
            ),
          )
        ) : (
          <p className="hint">还没有业务记录。从创建产品、往来单位和仓库开始。</p>
        )}
      </section>
    </>
  );
}
