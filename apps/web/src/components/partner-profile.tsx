'use client';
import { useLanguage } from '@/components/locale-provider';
import Link from 'next/link';
import { text, labels, can, type Bootstrap } from '@/lib/client';
import { Empty } from './ui';
export interface ProfileDoc {
  id: string;
  number: string;
  kind: string;
  status: string;
  date: string;
  dueDate: string | null;
  currency: string;
  total: string;
  paidAmount: string;
  outstanding: string;
}
export interface ProfileQuote {
  id: string;
  number: string;
  status: string;
  date: string;
  validUntil: string | null;
  currency: string;
  total: string;
  quoteDecision: string;
}
export interface ProfileOrder {
  id: string;
  number: string;
  kind: string;
  status: string;
  date: string;
  currency: string;
  total: string;
}
export interface ProfileShipment {
  id: string;
  kind: string;
  createdAt: string;
  warehouse: string;
  documentId: string | null;
  number: string;
  quantity: string;
  note: string;
}
export interface PartnerProfileData {
  partner: { id: string; code: string; name: string; type: string; contact: string; email: string; phone: string; address: string };
  documents: ProfileDoc[];
  quotes: ProfileQuote[];
  orders: ProfileOrder[];
  shipments: ProfileShipment[];
  summary: {
    baseCurrency: string;
    totalInvoiced: string | null;
    totalPaid: string | null;
    receivable: string | null;
    payable: string | null;
    outstanding: string | null;
  };
}
const decisions: Record<string, string> = {
  PENDING: '待回复',
  ACCEPTED: '已接受',
  REFUSED: '已拒绝',
};
export default function PartnerProfile({
  profile,
  boot,
}: {
  profile: PartnerProfileData;
  boot: Bootstrap;
}) {
  const { t, money } = useLanguage();
  const p = profile.partner,
    s = profile.summary,
    canEdit = can(boot.role, 'partners');
  return (
    <>
      <div className="heading">
        <div>
          <p className="eyebrow">PARTNER PROFILE</p>
          <h1>
            {p.code} · {p.name}{' '}
            <span className={`status ${p.type.toLowerCase()}`}>{t(labels[p.type])}</span>
          </h1>
          <p className="subtitle">
            {[p.contact, p.phone, p.email].filter(Boolean).join(' · ') || t('未填写联系方式')}
          </p>
        </div>
        {canEdit && (
          <Link className="button" href="/modules/partners">
            {t('返回往来单位')}
          </Link>
        )}
      </div>
      <section className="panel document-info">
        <div>
          <small>{t('往来单位')}</small>
          <h3>{p.name}</h3>
          <p>{p.address || t('未填写地址')}</p>
        </div>
        {can(boot.role, 'finance') && <dl>
          <dt>{t('累计开票金额')}</dt>
          <dd>
            {s.baseCurrency} {money(s.totalInvoiced)}
          </dd>
          <dt>{t('累计已收付金额')}</dt>
          <dd>
            {s.baseCurrency} {money(s.totalPaid)}
          </dd>
          <dt>{t('应收未收')}</dt>
          <dd>
            {s.baseCurrency} {money(s.receivable)}
          </dd>
          <dt>{t('应付未付')}</dt>
          <dd>
            {s.baseCurrency} {money(s.payable)}
          </dd>
          <dt>{t('净未结余额')}</dt>
          <dd>
            <strong>
              {s.baseCurrency} {money(s.outstanding)}
            </strong>
          </dd>
        </dl>}
      </section>
      <div className="section-heading">
        <h2>{t('报价单列表')}</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('单号')}</th>
              <th>{t('状态')}</th>
              <th>{t('客户回复')}</th>
              <th>{t('单据日期')}</th>
              <th>{t('报价有效期')}</th>
              <th>{t('币种')}</th>
              <th>{t('含税总额')}</th>
            </tr>
          </thead>
          <tbody>
            {profile.quotes.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/documents/${d.id}`}>{d.number}</Link>
                </td>
                <td>
                  <span className={`status ${d.status.toLowerCase()}`}>{t(labels[d.status])}</span>
                </td>
                <td>{t(decisions[d.quoteDecision] ?? d.quoteDecision)}</td>
                <td>{text(d.date).slice(0, 10)}</td>
                <td>{d.validUntil ? text(d.validUntil).slice(0, 10) : '—'}</td>
                <td>{d.currency}</td>
                <td>{money(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!profile.quotes.length && <Empty text="暂无报价单记录。" />}
      </div>
      <div className="section-heading">
        <h2>{t('订单列表')}</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('单号')}</th>
              <th>{t('类型')}</th>
              <th>{t('状态')}</th>
              <th>{t('单据日期')}</th>
              <th>{t('币种')}</th>
              <th>{t('含税总额')}</th>
            </tr>
          </thead>
          <tbody>
            {profile.orders.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/documents/${d.id}`}>{d.number}</Link>
                </td>
                <td>{t(labels[d.kind])}</td>
                <td>
                  <span className={`status ${d.status.toLowerCase()}`}>{t(labels[d.status])}</span>
                </td>
                <td>{text(d.date).slice(0, 10)}</td>
                <td>{d.currency}</td>
                <td>{money(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!profile.orders.length && <Empty text="暂无订单记录。" />}
      </div>
      {can(boot.role, 'inventory') && <><div className="section-heading">
        <h2>{t('发货列表')}</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('时间')}</th>
              <th>{t('操作')}</th>
              <th>{t('关联单据')}</th>
              <th>{t('仓库')}</th>
              <th>{t('变动数量')}</th>
              <th>{t('备注')}</th>
            </tr>
          </thead>
          <tbody>
            {profile.shipments.map((s) => (
              <tr key={s.id}>
                <td>{text(s.createdAt).replace('T', ' ').slice(0, 16)}</td>
                <td>{t(labels[s.kind])}</td>
                <td>
                  {s.documentId ? (
                    <Link href={`/documents/${s.documentId}`}>{s.number}</Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{s.warehouse}</td>
                <td>{s.quantity}</td>
                <td>{s.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!profile.shipments.length && <Empty text="暂无发货记录。" />}
      </div></>}
      {can(boot.role, 'finance') && <><div className="section-heading">
        <h2>{t('发票列表')}</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('单号')}</th>
              <th>{t('类型')}</th>
              <th>{t('状态')}</th>
              <th>{t('日期')}</th>
              <th>{t('到期日期')}</th>
              <th>{t('币种')}</th>
              <th>{t('含税总额')}</th>
              <th>{t('已付金额')}</th>
              <th>{t('未付金额')}</th>
            </tr>
          </thead>
          <tbody>
            {profile.documents.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/documents/${d.id}`}>{d.number}</Link>
                </td>
                <td>{t(labels[d.kind])}</td>
                <td>
                  <span className={`status ${d.status.toLowerCase()}`}>{t(labels[d.status])}</span>
                </td>
                <td>{text(d.date).slice(0, 10)}</td>
                <td>{d.dueDate ? text(d.dueDate).slice(0, 10) : '—'}</td>
                <td>{d.currency}</td>
                <td>{money(d.total)}</td>
                <td>{money(d.paidAmount)}</td>
                <td>{money(d.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!profile.documents.length && <Empty text="暂无发票记录。" />}
      </div>
      <p className="hint">
        {t('汇总金额按单据汇率折算为本位币；仅统计已确认（非草稿、非作废）的发票。')}
      </p></>}
    </>
  );
}
