import { serverLanguage } from '@/lib/i18n-server';
import { formatMoney } from '@/lib/i18n';
import { backend } from '@/lib/api';
import { labels, type Document } from '@/lib/client';
import { notFound } from 'next/navigation';
import PrintButton from '@/components/print-button';
import { printableLines } from '@/lib/document-lines';
export default async function Page({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { t, locale } = await serverLanguage();
  const money = (value: unknown) => formatMoney(value, locale);
  const price = (value: unknown) => formatMoney(value, locale, 4);
  const { id } = await params;
  const [r, b] = await Promise.all([
    backend(`erp/documents/${encodeURIComponent(id)}`),
    backend('erp/bootstrap'),
  ]);
  if (r.status === 404 || r.status === 400) notFound();
  if (!r.ok || !b.ok) throw Error();
  const doc: Document = await r.json(),
    { company } = await b.json();
  return (
    <>
      <PrintButton />
      <article className="print-document">
        <div className="print-heading">
          <div>
            <h1>{company.name}</h1>
            <p className="preserve">{company.address}</p>
            <p>{company.taxNumber}</p>
          </div>
          <div>
            <h2>{t(labels[doc.kind])}</h2>
            <p>{doc.number}</p>
            <strong>{t(labels[doc.status])}</strong>
          </div>
        </div>
        <section className="document-info">
          <div>
            <h3>{doc.partnerSnapshot.name}</h3>
            <p className="preserve">{doc.partnerSnapshot.address}</p>
            <p>{doc.partnerSnapshot.taxNumber}</p>
          </div>
          <div>
            <p>
              {t('日期：')}
              {doc.date.slice(0, 10)}
            </p>
            <p>
              {t('到期日：')}
              {doc.dueDate?.slice(0, 10) || '—'}
            </p>
            <p>
              {t('币种：')}
              {doc.currency}
            </p>
            <p>
              {t('贸易术语：')}
              {doc.incoterm || '—'} {doc.incotermLocation}
            </p>
            {doc.customerReference && (
              <p>
                {t('参考号：')}
                {doc.customerReference}
              </p>
            )}
            {doc.validUntil && (
              <p>
                {t('报价有效期：')}
                {doc.validUntil.slice(0, 10)}
              </p>
            )}
            {doc.deliveryDate && (
              <p>
                {t('交货日期：')}
                {doc.deliveryDate.slice(0, 10)}
              </p>
            )}
            {doc.paymentTerms && (
              <p>
                {t('付款条件：')}
                {doc.paymentTerms}
              </p>
            )}
            {doc.paymentMethod && (
              <p>
                {t('付款方式：')}
                {doc.paymentMethod}
              </p>
            )}
            {doc.shippingMethod && (
              <p>
                {t('配送方式：')}
                {doc.shippingMethod}
              </p>
            )}
          </div>
        </section>
        <table>
          <thead>
            <tr>
              {doc.kind === 'QUOTE' && <th>{t('序号')}</th>}
              <th>{t('描述')}</th>
              <th>{t('数量')}</th>
              <th>{t('单价')}</th>
              <th>{t('折扣%')}</th>
              <th>{t('税率%')}</th>
              <th>{t('金额')}</th>
            </tr>
          </thead>
          <tbody>
            {printableLines(doc.lines).map((l, i) => (
              <tr key={l.id}>
                {doc.kind === 'QUOTE' && <td>{(l.position ?? i) + 1}</td>}
                <td>{l.description}</td>
                {l.kind === 'ITEM' ? (
                  <>
                    <td>{l.quantity}</td>
                    <td>{price(l.unitPrice)}</td>
                    <td>{l.discountRate}</td>
                    <td>{l.taxRate}</td>
                    <td>{money(l.total)}</td>
                  </>
                ) : (
                  <td colSpan={5}>{l.kind === 'SUBTOTAL' ? money(l.net) : ''}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="document-summary">
          <div>
            <p>
              {t('整单折扣：')}
              {doc.discountRate}%
            </p>
            <p className="preserve">{doc.notes}</p>
          </div>
          <dl>
            <dt>{t('未税金额')}</dt>
            <dd>{money(doc.subtotal)}</dd>
            <dt>{t('税额')}</dt>
            <dd>{money(doc.taxTotal)}</dd>
            <dt>{t('合计')}</dt>
            <dd>
              <strong>
                {doc.currency} {money(doc.total)}
              </strong>
            </dd>
            <dt>{t('已付')}</dt>
            <dd>{money(doc.paidAmount)}</dd>
          </dl>
        </div>
      </article>
    </>
  );
}
