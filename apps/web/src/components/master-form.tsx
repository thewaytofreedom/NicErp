'use client';
import { useLanguage } from '@/components/locale-provider';
import { useState } from 'react';
import { request, requestKey, text, type Bootstrap, type Row } from '@/lib/client';
import { fieldsFor } from '@/lib/forms';
import { Dialog, ErrorMessage } from './ui';
import ProductMatch from './product-match';
export default function MasterForm({
  resource,
  bootstrap,
  record,
  close,
  saved,
}: {
  resource: string;
  bootstrap: Bootstrap;
  record?: Row;
  close: () => void;
  saved: () => void;
}) {
  const { t } = useLanguage();
  const fields = fieldsFor(resource, bootstrap, !!record),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [parts, setParts] = useState<
    {
      productId: string;
      quantity: string;
    }[]
  >(
    (record?.components ?? []) as {
      productId: string;
      quantity: string;
    }[],
  );
  const [matchedProduct, setMatchedProduct] = useState({
    id: text(record?.productId),
    name: record?.product
      ? `${text((record.product as Row).sku)} · ${text((record.product as Row).name)}`
      : '',
  });
  const [key, setKey] = useState(requestKey);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget),
      body: Record<string, unknown> = {};
    for (const f of fields) {
      body[f.key] =
        f.type === 'checkbox'
          ? form.has(f.key)
          : f.type === 'product'
            ? matchedProduct.id
            : f.type === 'parts'
              ? parts
              : f.type === 'tags'
                ? text(form.get(f.key))
                    .split(/\r?\n/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                : text(form.get(f.key));
    }
    if (!body.password) delete body.password;
    try {
      if (fields.some((f) => f.type === 'product' && f.required) && !matchedProduct.id)
        throw Error(t('请先匹配产品编号'));
      await request(
        resource === 'bank-transfer'
          ? 'erp/bank/transfer'
          : resource === 'bank-entries'
            ? 'erp/bank/transaction'
            : `erp/${resource}${record && resource !== 'company' ? '/' + record.id : ''}`,
        record && resource !== 'company' ? 'PATCH' : 'POST',
        ['bank-transfer', 'bank-entries'].includes(resource) ? { ...body, requestKey: key } : body,
      );
      saved();
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Dialog title={record ? t('编辑资料') : t('新建资料')} close={() => !busy && close()} wide>
      <form onSubmit={submit} onChange={() => setKey(requestKey())}>
        <div className="form-grid">
          {fields.map((f) => {
            const v = record?.[f.key] ?? f.default ?? '';
            return (
              <label
                key={f.key}
                className={['textarea', 'tags', 'parts'].includes(f.type ?? '') ? 'span-2' : ''}
              >
                <span>
                  {t(f.label)}
                  {f.required && <em> *</em>}
                </span>
                {f.type === 'product' ? (
                  <ProductMatch
                    label={t(f.label)}
                    usage="purchase"
                    selected={matchedProduct.name}
                    onSelect={(p) => setMatchedProduct({ id: p.id, name: `${p.sku} · ${p.name}` })}
                  />
                ) : f.type === 'checkbox' ? (
                  <input type="checkbox" name={f.key} defaultChecked={!!v} />
                ) : f.type === 'parts' ? (
                  <div className="parts-editor">
                    {parts.map((p, i) => (
                      <div className="inline-fields" key={i}>
                        <ProductMatch
                          label={t('组成零件 {0}', { '0': i + 1 })}
                          usage="components"
                          selected={
                            p.productId
                              ? (bootstrap.products.find((x) => x.id === p.productId)?.sku ??
                                p.productId)
                              : ''
                          }
                          onSelect={(product) =>
                            setParts(
                              parts.map((x, n) => (n === i ? { ...x, productId: product.id } : x)),
                            )
                          }
                        />
                        <input
                          aria-label={t('组成数量')}
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          required
                          value={p.quantity}
                          onChange={(e) =>
                            setParts(
                              parts.map((x, n) =>
                                n === i ? { ...x, quantity: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setParts(parts.filter((_, n) => n !== i))}
                        >
                          {t('移除')}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setParts([...parts, { productId: '', quantity: '1' }])}
                    >
                      {t('＋ 添加零件')}
                    </button>
                  </div>
                ) : f.type === 'select' ? (
                  <select
                    aria-label={t(f.label)}
                    name={f.key}
                    defaultValue={text(v)}
                    required={f.required}
                  >
                    <option value="">{t('请选择')}</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {/^[0-9a-f-]{36}$/i.test(o.value) ? o.label : t(o.label)}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'textarea' || f.type === 'tags' ? (
                  <textarea
                    aria-label={t(f.label)}
                    name={f.key}
                    rows={f.key === 'content' ? 12 : 3}
                    defaultValue={Array.isArray(v) ? v.join('\n') : text(v)}
                    required={f.required}
                  />
                ) : (
                  <input
                    type={f.type ?? 'text'}
                    aria-label={t(f.label)}
                    name={f.key}
                    defaultValue={f.type === 'date' ? text(v).slice(0, 10) : text(v)}
                    required={f.required}
                    step={f.type === 'number' ? '0.0001' : undefined}
                    minLength={f.type === 'password' ? 12 : undefined}
                    autoComplete={f.type === 'password' ? 'new-password' : undefined}
                  />
                )}{' '}
                {f.hint && <small>{t(f.hint)}</small>}
              </label>
            );
          })}
        </div>
        <ErrorMessage error={t(error)} />
        <div className="form-actions">
          <button type="button" onClick={close} disabled={busy}>
            {t('取消')}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t('保存中…') : t('保存')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
