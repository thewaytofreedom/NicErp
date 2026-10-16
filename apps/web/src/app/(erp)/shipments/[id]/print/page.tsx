import { serverLanguage } from '@/lib/i18n-server';
import { backend } from '@/lib/api';
import { labels } from '@/lib/client';
import { notFound } from 'next/navigation';
import PrintButton from '@/components/print-button';
interface ShipmentLine {
  lineId: string;
  quantity: string;
}
interface ShipmentDoc {
  id: string;
  number: string;
  kind: string;
  date: string;
  currency: string;
  customerReference: string;
  shippingMethod: string;
  incoterm: string;
  incotermLocation: string;
  deliveryDate: string | null;
  partner: { name: string; address: string; taxNumber: string };
  lines: {
    id: string;
    description: string;
    quantity: string;
    fulfilled: string;
    product: { sku: string; unit: string } | null;
  }[];
}
interface ShipmentOp {
  id: string;
  number: string;
  kind: string;
  date: string;
  note: string;
  createdAt: string;
  lineQuantities: ShipmentLine[];
  warehouse: { name: string; address: string };
  document: ShipmentDoc | null;
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = await serverLanguage();
  const { id } = await params;
  const [r, b] = await Promise.all([
    backend(`erp/shipments/${encodeURIComponent(id)}`),
    backend('erp/bootstrap'),
  ]);
  if (r.status === 404 || r.status === 400) notFound();
  if (!r.ok || !b.ok) throw Error();
  const op: ShipmentOp = await r.json(),
    { company } = await b.json(),
    doc = op.document,
    isReturn = op.kind.endsWith('_RETURN'),
    title = isReturn
      ? op.kind === 'SHIPMENT_RETURN'
        ? t('销售退回单')
        : t('采购退货单')
      : op.kind === 'SHIPMENT'
        ? t('销售发货单')
        : t('采购收货单');
  const shipped = new Map(op.lineQuantities.map((l) => [l.lineId, l.quantity]));
  const rows = (doc?.lines ?? []).filter((l) => shipped.has(l.id));
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
            <h2>{title}</h2>
            <p>{op.number || op.id.slice(0, 8)}</p>
            <p>
              {t('业务日期：')}
              {String(op.date).slice(0, 10)}
            </p>
          </div>
        </div>
        <section className="document-info">
          <div>
            <h3>{doc?.partner.name ?? '—'}</h3>
            <p className="preserve">{doc?.partner.address}</p>
            <p>{doc?.partner.taxNumber}</p>
          </div>
          <div>
            <p>
              {t('关联订单：')}
              {doc?.number ?? '—'}
            </p>
            <p>
              {t('仓库：')}
              {op.warehouse.name}
            </p>
            {doc?.shippingMethod && (
              <p>
                {t('配送方式：')}
                {doc.shippingMethod}
              </p>
            )}
            {doc?.customerReference && (
              <p>
                {t('参考号：')}
                {doc.customerReference}
              </p>
            )}
            {doc?.incoterm && (
              <p>
                {t('贸易术语：')}
                {doc.incoterm} {doc.incotermLocation}
              </p>
            )}
            {doc?.deliveryDate && (
              <p>
                {t('交货日期：')}
                {doc.deliveryDate.slice(0, 10)}
              </p>
            )}
          </div>
        </section>
        <table>
          <thead>
            <tr>
              <th>{t('描述')}</th>
              <th>{t('订单数量')}</th>
              <th>{isReturn ? t('本次退回数量') : t('本次发货数量')}</th>
              <th>{t('单位')}</th>
              <th>{t('累计已履约')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td>{l.quantity}</td>
                <td>
                  <strong>{shipped.get(l.id)}</strong>
                </td>
                <td>{l.product?.unit ?? '—'}</td>
                <td>{l.fulfilled}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="document-summary">
          <div>
            <p className="preserve">{op.note}</p>
          </div>
          <dl>
            <dt>{t('业务类型')}</dt>
            <dd>{t(labels[op.kind])}</dd>
            <dt>{t('登记时间')}</dt>
            <dd>{String(op.createdAt).replace('T', ' ').slice(0, 16)}</dd>
          </dl>
        </div>
        <section className="signature-grid">
          <div>
            <p>{t('发货人签字：')}</p>
          </div>
          <div>
            <p>{t('收货人签字：')}</p>
          </div>
        </section>
      </article>
    </>
  );
}
