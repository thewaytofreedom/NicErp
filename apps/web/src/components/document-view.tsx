'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  request,
  requestKey,
  text,
  labels,
  money,
  price,
  can,
  areaFor,
  type Bootstrap,
  type Document,
  type Row,
} from '@/lib/client';
import { Dialog, ErrorMessage } from './ui';
export default function DocumentView({ doc, boot }: { doc: Document; boot: Bootstrap }) {
  const router = useRouter(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [dialog, setDialog] = useState('');
  const writable = can(boot.role, areaFor(doc.kind)),
    live = !['DRAFT', 'VOID'].includes(doc.status);
  async function action(action: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    try {
      const result = await request<{ id: string }>(
        `erp/documents/${doc.id}/${action}`,
        'POST',
        body,
      );
      if (action === 'convert' || action === 'clone') router.push(`/documents/${result.id}`);
      if (action === 'delete')
        router.push(
          `/modules/${areaFor(doc.kind) === 'finance' ? 'finance' : doc.kind === 'PURCHASE' ? 'purchasing' : 'sales'}`,
        );
      router.refresh();
      setDialog('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="heading">
        <div>
          <p className="eyebrow">{labels[doc.kind]}</p>
          <h1>
            {doc.number}{' '}
            <span className={`status ${doc.status.toLowerCase()}`}>{labels[doc.status]}</span>
          </h1>
          <p className="subtitle">
            {doc.partnerSnapshot.name} · {doc.date.slice(0, 10)} · {doc.currency}
          </p>
        </div>
        <Link className="button" href={`/documents/${doc.id}/print`} target="_blank">
          打印 / 保存 PDF
        </Link>
      </div>
      <ErrorMessage error={error} />
      <div className="toolbar">
        <div className="toolbar-actions">
          {writable && (
            <button disabled={busy} onClick={() => void action('clone')}>
              复制为新草稿
            </button>
          )}
          {writable && doc.status === 'DRAFT' && (
            <button
              disabled={busy}
              onClick={() => {
                if (confirm('删除此草稿？')) void action('delete');
              }}
            >
              删除草稿
            </button>
          )}
          {writable && live && (
            <button disabled={busy} onClick={() => void action('reopen')}>
              返回草稿
            </button>
          )}
          {writable &&
            doc.kind === 'QUOTE' &&
            doc.status === 'CONFIRMED' &&
            doc.quoteDecision === 'PENDING' && (
              <>
                <button disabled={busy} onClick={() => void action('accept')}>
                  客户接受报价
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt('拒绝原因（可留空）');
                    if (reason !== null) void action('reject', { reason });
                  }}
                >
                  客户拒绝报价
                </button>
              </>
            )}
          {writable && doc.status === 'DRAFT' && (
            <>
              <Link className="button" href={`/documents/${doc.id}/edit`}>
                编辑草稿
              </Link>
              <button className="primary" disabled={busy} onClick={() => action('confirm')}>
                确认单据
              </button>
            </>
          )}
          {writable && live && doc.kind === 'QUOTE' && doc.quoteDecision !== 'REFUSED' && (
            <button disabled={busy} onClick={() => action('convert', { kind: 'SALE' })}>
              转销售订单
            </button>
          )}
          {live && doc.kind === 'SALE' && (
            <>
              {writable && can(boot.role, 'finance') && (
                <button disabled={busy} onClick={() => action('convert', { kind: 'INVOICE' })}>
                  转客户发票
                </button>
              )}
              {writable && can(boot.role, 'purchasing') && (
                <button disabled={busy} onClick={() => setDialog('convert')}>
                  转采购订单
                </button>
              )}
            </>
          )}
          {live && doc.kind === 'PURCHASE' && writable && can(boot.role, 'finance') && (
            <button disabled={busy} onClick={() => action('convert', { kind: 'BILL' })}>
              转供应商发票
            </button>
          )}
          {live && ['SALE', 'PURCHASE'].includes(doc.kind) && can(boot.role, 'inventory') && (
            <>
              <button className="primary" onClick={() => setDialog('fulfill')}>
                {doc.kind === 'SALE' ? '登记发货' : '登记收货'}
              </button>
              <button onClick={() => setDialog('return')}>登记退回</button>
            </>
          )}
          {live &&
            ['INVOICE', 'BILL'].includes(doc.kind) &&
            can(boot.role, 'finance') &&
            Number(doc.total) > Number(doc.paidAmount) && (
              <button className="primary" onClick={() => setDialog('pay')}>
                {doc.kind === 'INVOICE' ? '登记收款' : '登记付款'}
              </button>
            )}
          {writable && doc.status !== 'VOID' && (
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (confirm('确认作废此单据？有已履约数量、付款或有效下游单据时将被拒绝。'))
                  void action('void');
              }}
            >
              作废
            </button>
          )}
        </div>
      </div>
      <section className="panel document-info">
        <div>
          <small>往来单位</small>
          <h3>{doc.partnerSnapshot.name}</h3>
          <p>{doc.partnerSnapshot.address || '未填写地址'}</p>
          <p>
            {doc.partnerSnapshot.contact} {doc.partnerSnapshot.email}
          </p>
        </div>
        <dl>
          <dt>到期日期</dt>
          <dd>{doc.dueDate?.slice(0, 10) || '—'}</dd>
          {doc.kind === 'QUOTE' && (
            <>
              <dt>报价有效期</dt>
              <dd>{doc.validUntil?.slice(0, 10) || '—'}</dd>
              <dt>客户回复</dt>
              <dd>
                {{ PENDING: '待回复', ACCEPTED: '已接受', REFUSED: '已拒绝' }[doc.quoteDecision] ||
                  doc.quoteDecision}{' '}
                {doc.decisionReason}
              </dd>
            </>
          )}
          <dt>参考号</dt>
          <dd>{doc.customerReference || '—'}</dd>
          <dt>交货日期</dt>
          <dd>{doc.deliveryDate?.slice(0, 10) || '—'}</dd>
          <dt>付款条件 / 方式</dt>
          <dd>
            {doc.paymentTerms || '—'} / {doc.paymentMethod || '—'}
          </dd>
          <dt>配送方式</dt>
          <dd>{doc.shippingMethod || '—'}</dd>
          <dt>汇率</dt>
          <dd>
            1 {doc.currency} = {doc.exchangeRate} {boot.company.currency}
          </dd>
          <dt>整单折扣</dt>
          <dd>{doc.discountRate}%</dd>
          <dt>贸易术语</dt>
          <dd>
            {doc.incoterm || '—'} {doc.incotermLocation}
          </dd>
          {doc.source && (
            <>
              <dt>来源单据</dt>
              <dd>
                <Link href={`/documents/${doc.source.id}`}>{doc.source.number}</Link>
              </dd>
            </>
          )}
        </dl>
      </section>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {doc.kind === 'QUOTE' && <th>序号</th>}
              <th>描述</th>
              <th>数量</th>
              <th>单价</th>
              <th>折扣 %</th>
              <th>税率 %</th>
              <th>未税金额</th>
              <th>含税金额</th>
              {['SALE', 'PURCHASE'].includes(doc.kind) && <th>已履约</th>}
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={l.id ?? i} className={l.kind.toLowerCase()}>
                {doc.kind === 'QUOTE' && <td>{(l.position ?? i) + 1}</td>}
                <td>{l.description}</td>
                {l.kind === 'ITEM' ? (
                  <>
                    <td>{l.quantity}</td>
                    <td>{price(l.unitPrice)}</td>
                    <td>{l.discountRate}</td>
                    <td>{l.taxRate}</td>
                    <td>{money(l.net)}</td>
                    <td>{money(l.total)}</td>
                    {['SALE', 'PURCHASE'].includes(doc.kind) && (
                      <td>
                        {l.fulfilled} / {l.quantity}
                      </td>
                    )}
                  </>
                ) : (
                  <td colSpan={['SALE', 'PURCHASE'].includes(doc.kind) ? 7 : 6}>
                    {l.kind === 'SUBTOTAL' ? `未税小计 ${money(l.net)}` : ''}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="document-summary">
        <p className="preserve">{doc.notes || '无备注'}</p>
        {doc.privateNotes && <p className="preserve">内部备注：{doc.privateNotes}</p>}
        <dl>
          <dt>未税合计</dt>
          <dd>
            {doc.currency} {money(doc.subtotal)}
          </dd>
          <dt>税额</dt>
          <dd>{money(doc.taxTotal)}</dd>
          <dt>含税总额</dt>
          <dd>
            <strong>
              {doc.currency} {money(doc.total)}
            </strong>
          </dd>
          {['INVOICE', 'BILL'].includes(doc.kind) && (
            <>
              <dt>已付金额</dt>
              <dd>{money(doc.paidAmount)}</dd>
              <dt>未付金额</dt>
              <dd>{money(Number(doc.total) - Number(doc.paidAmount))}</dd>
            </>
          )}
        </dl>
      </div>
      {!!doc.children.length && (
        <section className="panel">
          <h3>关联单据</h3>
          <div className="related-docs">
            {doc.children.map((d) => (
              <Link key={d.id} href={`/documents/${d.id}`}>
                {d.number} · {labels[d.status]}
              </Link>
            ))}
          </div>
        </section>
      )}
      {!!doc.operations.length && (
        <section className="panel">
          <h3>收发货与退回记录</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作</th>
                  <th>仓库</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {doc.operations.map((op) => (
                  <tr key={op.id}>
                    <td>{text(op.createdAt).replace('T', ' ').slice(0, 16)}</td>
                    <td>{labels[text(op.kind)]}</td>
                    <td>{text((op.warehouse as Row).name)}</td>
                    <td>{text(op.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {!!doc.payments.length && (
        <section className="panel">
          <h3>收付款记录</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>账户</th>
                  <th>金额</th>
                  <th>参考号</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {doc.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{text(p.date).slice(0, 10)}</td>
                    <td>{text((p.account as Row).name)}</td>
                    <td>{money(p.amount)}</td>
                    <td>{text(p.reference)}</td>
                    <td>{p.reversedAt ? '已冲销' : '有效'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {dialog && (
        <OperationDialog
          mode={dialog}
          doc={doc}
          boot={boot}
          close={() => setDialog('')}
          saved={() => {
            router.refresh();
            setDialog('');
          }}
        />
      )}
    </>
  );
}
function OperationDialog({
  mode,
  doc,
  boot,
  close,
  saved,
}: {
  mode: string;
  doc: Document;
  boot: Bootstrap;
  close: () => void;
  saved: () => void;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [key, setKey] = useState(requestKey);
  const items = doc.lines.filter((l) => l.kind === 'ITEM');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    let body: Record<string, unknown> = { ...Object.fromEntries(f), requestKey: key },
      action = mode;
    if (['fulfill', 'return'].includes(mode)) {
      action = 'fulfill';
      body = {
        warehouseId: f.get('warehouseId'),
        note: f.get('note'),
        requestKey: key,
        action: mode === 'return' ? 'RETURN' : 'FULFILL',
        lines: items
          .map((l) => ({ lineId: l.id, quantity: text(f.get(l.id!)) }))
          .filter((l) => Number(l.quantity) > 0),
      };
    }
    if (mode === 'convert') {
      body = { kind: 'PURCHASE', partnerId: f.get('partnerId') };
    }
    try {
      const result = await request<{ id: string }>(
        `erp/documents/${doc.id}/${action}`,
        'POST',
        body,
      );
      if (mode === 'convert') router.push(`/documents/${result.id}`);
      saved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const title =
    mode === 'pay'
      ? doc.kind === 'INVOICE'
        ? '登记收款'
        : '登记付款'
      : mode === 'convert'
        ? '转采购订单'
        : mode === 'return'
          ? '登记退回'
          : doc.kind === 'SALE'
            ? '登记发货'
            : '登记收货';
  return (
    <Dialog
      title={title}
      close={() => !busy && close()}
      wide={['fulfill', 'return'].includes(mode)}
    >
      <form onSubmit={submit} onChange={() => setKey(requestKey())}>
        {mode === 'pay' ? (
          <>
            <label>
              资金账户
              <select name="accountId" required>
                <option value="">请选择相同币种的账户</option>
                {boot.accounts
                  .filter((a) => a.currency === doc.currency)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {text(a.name)} ({text(a.currency)})
                    </option>
                  ))}
              </select>
            </label>
            <label>
              金额 ({doc.currency})
              <input
                name="amount"
                type="number"
                required
                min="0.01"
                step="0.01"
                defaultValue={(Number(doc.total) - Number(doc.paidAmount)).toFixed(2)}
              />
            </label>
            <label>
              日期
              <input
                name="date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              付款参考号
              <input name="reference" maxLength={200} />
            </label>
          </>
        ) : mode === 'convert' ? (
          <>
            <label>
              供应商
              <select name="partnerId" required>
                <option value="">请选择供应商</option>
                {boot.partners
                  .filter((p) => ['SUPPLIER', 'BOTH'].includes(p.type))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <p className="hint">将以产品参考成本生成本位币采购草稿，请核对供应商报价后确认。</p>
          </>
        ) : (
          <>
            <label>
              仓库
              <select name="warehouseId" required>
                <option value="">请选择仓库</option>
                {boot.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {text(w.name)}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">填写本次数量，0 表示跳过。退回必须选择原收发货仓库。</p>
            {items.map((l) => {
              const available =
                mode === 'return' ? Number(l.fulfilled) : Number(l.quantity) - Number(l.fulfilled);
              return (
                <label key={l.id}>
                  {l.description}
                  <input
                    aria-label={l.description + ' 本次数量'}
                    name={l.id}
                    type="number"
                    step="0.0001"
                    min="0"
                    max={available}
                    defaultValue={mode === 'return' ? '0' : available}
                  />
                  <small>
                    {mode === 'return' ? '累计可退' : '尚未履约'}：{available}
                  </small>
                </label>
              );
            })}
            <label>
              备注
              <textarea name="note" maxLength={1000} />
            </label>
          </>
        )}
        <ErrorMessage error={error} />
        <div className="form-actions">
          <button type="button" onClick={close} disabled={busy}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? '处理中…' : '确认'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
