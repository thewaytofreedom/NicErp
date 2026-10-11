'use client';
import { useState, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  request,
  labels,
  money,
  type Bootstrap,
  type Document,
  type DocLine,
  type Product,
} from '@/lib/client';
import ProductMatch from './product-match';
import { incoterms } from '@/lib/incoterms';
import { parseCSV, downloadCSV } from '@/lib/csv';
import { ErrorMessage } from './ui';
import { numberQuoteLines } from '@/lib/document-lines';
const blank = (): DocLine => ({
  kind: 'ITEM',
  productId: '',
  description: '',
  quantity: '1',
  unitPrice: '0',
  discountRate: '0',
  taxRate: '0',
});
export default function DocumentEditor({
  boot,
  kind,
  document,
}: {
  boot: Bootstrap;
  kind: string;
  document?: Document;
}) {
  const router = useRouter(),
    [lines, setStoredLines] = useState<DocLine[]>(() =>
      kind === 'QUOTE'
        ? numberQuoteLines(document?.lines ?? [blank()])
        : (document?.lines ?? [blank()]),
    ),
    [cur, setCur] = useState(document?.currency ?? boot.company.currency),
    [rate, setRate] = useState(document?.exchangeRate ?? '1'),
    [discount, setDiscount] = useState(document?.discountRate ?? '0'),
    [error, setError] = useState(''),
    [preference, setPreference] = useState('UNIQUE'),
    [warnings, setWarnings] = useState<string[]>([]),
    [selected, setSelected] = useState<number[]>([]),
    [batchPercent, setBatchPercent] = useState('0'),
    [busy, setBusy] = useState(false);
  function setLines(next: SetStateAction<DocLine[]>) {
    setStoredLines((current) => {
      const result = typeof next === 'function' ? next(current) : next;
      return kind === 'QUOTE' ? numberQuoteLines(result) : result;
    });
  }
  function sequence(index: number, input: HTMLInputElement) {
    const value = input.value;
    const position = Number(value) - 1;
    const message =
      !/^[1-9]\d*$/.test(value) || position > 999999
        ? '序号必须为 1 至 1000000 的整数'
        : lines.some((line, n) => n !== index && line.position === position)
          ? `序号 ${value} 已存在，请使用不同的序号`
          : '';
    input.setCustomValidity(message);
    if (message) {
      setError(message);
      input.reportValidity();
      return;
    }
    setLines(lines.map((line, n) => (n === index ? { ...line, position } : line)));
    setSelected([]);
    setError('');
  }
  function update(index: number, key: string, value: string) {
    setLines(lines.map((l, i) => (i === index ? { ...l, [key]: value } : l)));
  }
  async function batch(mode: string) {
    setError('');
    setBusy(true);
    try {
      const result = await request<{ lines: DocLine[] }>('erp/documents/transform-lines', 'POST', {
        kind,
        mode,
        percent: batchPercent,
        lines,
        indexes: selected,
      });
      setLines(result.lines);
      setSelected([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function supplierPrice(index: number, form: HTMLFormElement | null) {
    if (!form) return;
    setError('');
    setBusy(true);
    try {
      const result = await request<{ unitPrice: string; source: string }>(
        'erp/documents/purchase-price',
        'POST',
        {
          kind,
          productId: lines[index].productId,
          partnerId: new FormData(form).get('partnerId'),
          quantity: lines[index].quantity,
          date: new FormData(form).get('date'),
          currency: cur,
          exchangeRate: rate,
        },
      );
      setLines(lines.map((l, i) => (i === index ? { ...l, unitPrice: result.unitPrice } : l)));
      setWarnings([
        result.source === 'SUPPLIER'
          ? '已按供应商有效报价、数量价阶及折扣填入单价'
          : '没有适用的供应商报价，使用产品参考成本',
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function block(index: number, action: 'UP' | 'DOWN' | 'COPY' | 'DELETE') {
    let end = index + 1;
    if (lines[index].kind === 'TITLE') {
      const level = lines[index].level ?? 1;
      while (end < lines.length) {
        if (lines[end].kind === 'TITLE' && (lines[end].level ?? 1) <= level) break;
        if (lines[end].kind === 'SUBTOTAL' && (lines[end].level ?? 1) === level) {
          end++;
          break;
        }
        end++;
      }
    }
    const part = lines.slice(index, end),
      remainder = [...lines.slice(0, index), ...lines.slice(end)];
    let next: DocLine[];
    if (action === 'COPY')
      next = [
        ...lines.slice(0, end),
        ...part.map((l) => ({ ...l, id: undefined, position: undefined })),
        ...lines.slice(end),
      ];
    else if (action === 'DELETE') next = remainder;
    else {
      const target =
        action === 'UP' ? Math.max(0, index - 1) : Math.min(remainder.length, index + 1);
      next = [...remainder.slice(0, target), ...part, ...remainder.slice(target)];
    }
    if (kind === 'QUOTE' && action === 'COPY') {
      let previous = -1;
      next = next.map((line) => {
        const position = Math.max(previous + 1, line.position ?? previous + 1);
        previous = position;
        return { ...line, position };
      });
    } else if (kind === 'QUOTE' && ['UP', 'DOWN'].includes(action)) {
      next = next.map((line, n) => ({ ...line, position: lines[n].position }));
    }
    setLines(next);
    setSelected([]);
  }
  function product(index: number, p: Product) {
    setLines((current) =>
      current.map((l, i) =>
        i === index
          ? {
              ...l,
              productId: p.id,
              freeText: false,
              description: `${p.sku} · ${p.name}`,
              unitPrice: (
                Number(['PURCHASE', 'BILL'].includes(kind) ? p.costPrice : p.salePrice) /
                (Number(rate) || 1)
              ).toFixed(4),
              taxRate: p.taxRate,
            }
          : l,
      ),
    );
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (lines.some((l) => l.kind === 'ITEM' && !l.productId && !l.freeText))
        throw Error('请先匹配每行的产品编号或替代号');
      const result = await request<{ id: string }>(
        `erp/documents${document ? '/' + document.id : ''}`,
        document ? 'PATCH' : 'POST',
        {
          ...Object.fromEntries(new FormData(e.currentTarget)),
          kind,
          version: document?.version,
          lines: lines.map(
            ({
              kind,
              position,
              productId,
              freeText,
              level,
              hidden,
              description,
              quantity,
              unitPrice,
              discountRate,
              taxRate,
            }) => ({
              kind,
              position,
              productId,
              freeText,
              level,
              hidden,
              description,
              quantity,
              unitPrice,
              discountRate,
              taxRate,
            }),
          ),
        },
      );
      router.push(`/documents/${result.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function importLines(file: File) {
    try {
      if (file.size > 1000000) throw Error('CSV 不能超过 1MB');
      const rows = parseCSV(await file.text());
      if (rows.length < 1 || rows.length > 200) throw Error('每次导入 1–200 行');
      const result = await request<{
        lines: DocLine[];
        warnings: { row: number; message: string }[];
      }>('erp/documents/import-lines', 'POST', {
        kind,
        preference,
        currency: cur,
        exchangeRate: rate,
        rows: rows.map((r) => {
          const serial = r['序号']?.trim();
          if (kind === 'QUOTE' && serial && !/^[1-9]\d*$/.test(serial))
            throw Error('CSV 序号必须为正整数');
          return {
            ...(kind === 'QUOTE' && serial ? { position: Number(serial) - 1 } : {}),
            number: r['产品编号'] || r['替代号'] || r.Ref || '',
            description: r['描述'] || r.Label || '',
            quantity: r['数量'] || r.Qty || '1',
            unitPrice: r['单价'] || r['PU ht'] || '',
            discountRate: r['折扣率'] || '0',
            ...(r['税率'] ? { taxRate: r['税率'] } : {}),
          };
        }),
      });
      setLines(result.lines);
      setSelected([]);
      setWarnings(result.warnings.map((w) => `第 ${w.row} 行：${w.message}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const estimates = lines
    .filter((l) => l.kind === 'ITEM')
    .map((l) => {
      const net =
        Number(l.quantity) *
        Number(l.unitPrice) *
        (1 - Number(l.discountRate) / 100) *
        (1 - Number(discount) / 100);
      return { net, tax: (net * Number(l.taxRate)) / 100 };
    });
  return (
    <>
      <div className="heading">
        <div>
          <p className="eyebrow">DOCUMENT EDITOR</p>
          <h1>{document ? `编辑 ${document.number}` : `新建${labels[kind]}`}</h1>
          <p className="subtitle">保存为草稿，核对后确认。金额以服务器计算结果为准。</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <section className="panel form-grid">
          <label>
            往来单位
            <select name="partnerId" required defaultValue={document?.partnerId ?? ''}>
              <option value="">请选择</option>
              {boot.partners
                .filter((p) =>
                  [['PURCHASE', 'BILL'].includes(kind) ? 'SUPPLIER' : 'CUSTOMER', 'BOTH'].includes(
                    p.type,
                  ),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            单据日期
            <input
              name="date"
              type="date"
              required
              defaultValue={document?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label>
            到期日期
            <input
              name="dueDate"
              type="date"
              defaultValue={document?.dueDate?.slice(0, 10) ?? ''}
            />
          </label>
          {kind === 'QUOTE' && (
            <label>
              报价有效期
              <input
                name="validUntil"
                type="date"
                defaultValue={
                  document?.validUntil?.slice(0, 10) ??
                  new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
                }
              />
            </label>
          )}
          <label>
            客户 / 供应商参考号
            <input
              name="customerReference"
              defaultValue={document?.customerReference ?? ''}
              maxLength={200}
            />
          </label>
          <label>
            预计交货日期
            <input
              name="deliveryDate"
              type="date"
              defaultValue={document?.deliveryDate?.slice(0, 10) ?? ''}
            />
          </label>
          <label>
            付款条件
            <input
              name="paymentTerms"
              list="payment-term-options"
              defaultValue={document?.paymentTerms ?? ''}
              maxLength={200}
            />
          </label>
          <label>
            付款方式
            <input
              name="paymentMethod"
              list="payment-method-options"
              defaultValue={document?.paymentMethod ?? ''}
              maxLength={100}
            />
          </label>
          <label>
            配送方式
            <input
              name="shippingMethod"
              list="shipment-method-options"
              defaultValue={document?.shippingMethod ?? ''}
              maxLength={100}
            />
          </label>
          <label>
            币种
            <input
              name="currency"
              required
              maxLength={3}
              value={cur}
              onChange={(e) => {
                setCur(e.target.value.toUpperCase());
                if (e.target.value.toUpperCase() === boot.company.currency) setRate('1');
              }}
            />
          </label>
          <label>
            汇率
            <input
              name="exchangeRate"
              type="number"
              min="0.000001"
              step="0.000001"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <small>
              1 {cur} = 此数值 {boot.company.currency}；修改汇率不会改写已填单价。
            </small>
          </label>
          <label>
            整单折扣 %
            <input
              name="discountRate"
              type="number"
              min="0"
              max="100"
              step="0.0001"
              required
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </label>
          <label>
            贸易术语
            <input
              name="incoterm"
              list="incoterm-options"
              defaultValue={document?.incoterm ?? ''}
              placeholder="例如 EXW、FOB Singapore"
              maxLength={100}
            />
            <datalist id="incoterm-options">
              {incoterms.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
              {boot.lookups
                .filter((l) => l.kind === 'INCOTERM')
                .map((l) => (
                  <option key={l.id} value={String(l.name)} />
                ))}
            </datalist>
          </label>
          <label>
            备注
            <textarea name="notes" defaultValue={document?.notes ?? ''} />
          </label>
          <label>
            贸易术语交付地点
            <input
              name="incotermLocation"
              defaultValue={document?.incotermLocation ?? ''}
              maxLength={200}
            />
          </label>
          <label>
            内部备注
            <textarea name="privateNotes" defaultValue={document?.privateNotes ?? ''} />
            <small>仅后台显示，不打印</small>
          </label>
        </section>
        <div className="section-heading">
          {(['PAYMENT_TERM', 'PAYMENT_METHOD', 'SHIPMENT_METHOD'] as const).map((type, index) => (
            <datalist
              key={type}
              id={
                ['payment-term-options', 'payment-method-options', 'shipment-method-options'][index]
              }
            >
              {boot.lookups
                .filter((l) => l.kind === type)
                .map((l) => (
                  <option key={l.id} value={String(l.name)} />
                ))}
            </datalist>
          ))}
          <h2>单据明细</h2>
          <div className="toolbar-actions">
            <select
              aria-label="明细导入匹配偏好"
              value={preference}
              onChange={(e) => setPreference(e.target.value)}
            >
              <option value="UNIQUE">唯一编号 / 替代号匹配</option>
              {kind === 'QUOTE' && (
                <>
                  <option value="1">任意货源：原厂 / 进口</option>
                  <option value="2">任意货源：原厂缺货时允许 WD</option>
                  <option value="3">中国货源：原厂 / 进口</option>
                  <option value="4">中国货源：原厂缺货时允许 WD</option>
                  <option value="5">SN / 海外货源</option>
                  <option value="6">中国货源：WD 替代件</option>
                </>
              )}
              <option value="7">直接产品编号</option>
            </select>
            <button
              type="button"
              onClick={() =>
                downloadCSV(
                  '单据明细模板.csv',
                  [
                    ...(kind === 'QUOTE' ? ['序号'] : []),
                    '产品编号',
                    '描述',
                    '数量',
                    '单价',
                    '折扣率',
                    '税率',
                  ],
                  [],
                )
              }
            >
              CSV 模板
            </button>
            <label className="button">
              导入明细
              <input
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importLines(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        {warnings.length > 0 && (
          <div className="panel" role="status">
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}
        <div className="toolbar">
          <div className="toolbar-actions">
            <button
              type="button"
              onClick={() =>
                setSelected(selected.length === lines.length ? [] : lines.map((_, i) => i))
              }
            >
              全选 / 取消
            </button>
            <label>
              批量百分比
              <input
                aria-label="批量百分比"
                type="number"
                min="0"
                max="100"
                step="0.0001"
                value={batchPercent}
                onChange={(e) => setBatchPercent(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy || !selected.length}
              onClick={() => void batch('DISCOUNT')}
            >
              设置选中行折扣
            </button>
            <button
              type="button"
              disabled={busy || !selected.length}
              onClick={() => void batch('PRICE')}
            >
              降低选中行单价
            </button>
            <button
              type="button"
              disabled={busy || !selected.length}
              onClick={() => void batch('DELETE')}
            >
              删除选中行
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="line-editor">
            <thead>
              <tr>
                {kind === 'QUOTE' && <th>序号</th>}
                <th>类型 / 产品</th>
                <th>描述</th>
                <th>数量</th>
                <th>单价</th>
                <th>行折扣 %</th>
                <th>税率 %</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={kind === 'QUOTE' ? l.position : i}>
                  {kind === 'QUOTE' && (
                    <td className="line-sequence">
                      <input
                        aria-label={`第 ${i + 1} 行序号`}
                        type="number"
                        min="1"
                        max="1000000"
                        step="1"
                        required
                        defaultValue={(l.position ?? i) + 1}
                        onInput={(e) => e.currentTarget.setCustomValidity('')}
                        onBlur={(e) => sequence(i, e.currentTarget)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                      />
                    </td>
                  )}
                  <td className="line-product">
                    {['TITLE', 'SUBTOTAL'].includes(l.kind) && (
                      <label>
                        层级
                        <input
                          aria-label={`第 ${i + 1} 行层级`}
                          type="number"
                          min="1"
                          max="9"
                          step="1"
                          value={l.level ?? 1}
                          onChange={(e) =>
                            setLines(
                              lines.map((x, n) =>
                                n === i ? { ...x, level: Number(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                      </label>
                    )}
                    {l.kind === 'TITLE' && (
                      <label>
                        <input
                          type="checkbox"
                          checked={!!l.hidden}
                          onChange={(e) =>
                            setLines(
                              lines.map((x, n) =>
                                n === i ? { ...x, hidden: e.target.checked } : x,
                              ),
                            )
                          }
                        />
                        打印折叠明细
                      </label>
                    )}
                    {l.kind === 'ITEM' && !l.freeText ? (
                      <ProductMatch
                        key={l.productId || 'unmatched'}
                        label={`第 ${i + 1} 行产品`}
                        usage={['PURCHASE', 'BILL'].includes(kind) ? 'purchase' : 'sale'}
                        selected={l.productId ? l.description : ''}
                        onSelect={(p) => product(i, p)}
                      />
                    ) : l.freeText ? (
                      '自由明细（不影响库存）'
                    ) : (
                      labels[l.kind]
                    )}
                  </td>
                  <td className="line-description">
                    <input
                      aria-label={`第 ${i + 1} 行描述`}
                      value={l.description}
                      onChange={(e) => update(i, 'description', e.target.value)}
                      maxLength={2000}
                    />
                  </td>
                  {['quantity', 'unitPrice', 'discountRate', 'taxRate'].map((k) => (
                    <td key={k}>
                      {l.kind === 'ITEM' && (
                        <input
                          aria-label={`第 ${i + 1} 行 ${k}`}
                          type="number"
                          min={k === 'quantity' ? '0.0001' : '0'}
                          max={k.endsWith('Rate') ? '100' : undefined}
                          step="0.0001"
                          required
                          value={String(l[k as keyof DocLine] ?? '')}
                          onChange={(e) => update(i, k, e.target.value)}
                        />
                      )}
                    </td>
                  ))}
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择第 ${i + 1} 行`}
                      checked={selected.includes(i)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? [...selected, i] : selected.filter((n) => n !== i),
                        )
                      }
                    />
                    <button type="button" onClick={() => block(i, 'UP')}>
                      上移
                    </button>
                    <button type="button" onClick={() => block(i, 'DOWN')}>
                      下移
                    </button>
                    <button type="button" onClick={() => block(i, 'COPY')}>
                      复制
                    </button>
                    <button
                      type="button"
                      aria-label={`移除第 ${i + 1} 行`}
                      onClick={() => block(i, 'DELETE')}
                    >
                      移除
                    </button>
                    {['PURCHASE', 'BILL'].includes(kind) && l.productId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => void supplierPrice(i, e.currentTarget.form)}
                      >
                        取供应商报价
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar">
          <div className="toolbar-actions">
            <button type="button" onClick={() => setLines([...lines, blank()])}>
              ＋ 产品明细
            </button>
            <button
              type="button"
              onClick={() =>
                setLines([
                  ...lines,
                  { ...blank(), kind: 'TITLE', level: 1, description: '分组标题' },
                ])
              }
            >
              ＋ 分组标题
            </button>
            <button
              type="button"
              onClick={() => setLines([...lines, { ...blank(), productId: null, freeText: true }])}
            >
              ＋ 自由明细
            </button>
            <button
              type="button"
              onClick={() => setLines([...lines, { ...blank(), kind: 'NOTE', description: '' }])}
            >
              ＋ 备注行
            </button>
            <button
              type="button"
              onClick={() =>
                setLines([...lines, { ...blank(), kind: 'SUBTOTAL', description: '小计' }])
              }
            >
              ＋ 小计行
            </button>
          </div>
          <span>
            预估含税总额：
            <strong>
              {cur} {money(estimates.reduce((n, l) => n + l.net + l.tax, 0))}
            </strong>
          </span>
        </div>
        <ErrorMessage error={error} />
        <div className="form-actions">
          <Link className="button" href={document ? `/documents/${document.id}` : '/'}>
            取消
          </Link>
          <button className="primary" disabled={busy}>
            {busy ? '保存中…' : '保存草稿'}
          </button>
        </div>
      </form>
    </>
  );
}
