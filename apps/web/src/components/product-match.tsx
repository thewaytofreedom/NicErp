'use client';
import { useLanguage } from '@/components/locale-provider';
import { useRef, useState } from 'react';
import { request, type Product } from '@/lib/client';
export default function ProductMatch({
  label,
  selected,
  usage,
  onSelect,
}: {
  label: string;
  selected: string;
  usage: 'sale' | 'purchase' | 'components';
  onSelect: (product: Product) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Product[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function match() {
    const q = query.trim();
    if (!q) {
      setMessage(t('请输入产品编号或替代号'));
      return;
    }
    const current = ++generation.current;
    setBusy(true);
    setRows([]);
    setMessage('');
    try {
      const path = `erp/products?match=number&usage=${usage}&q=${encodeURIComponent(q)}`;
      let result = await request<{
        rows: Product[];
        total: number;
      }>(path + '&exact=1');
      if (!result.total)
        result = await request<{
          rows: Product[];
          total: number;
        }>(path);
      if (generation.current !== current) return;
      if (result.total === 1) {
        onSelect(result.rows[0]);
        setQuery('');
      } else {
        setRows(result.rows);
        setMessage(
          result.total
            ? t('找到 {0} 个匹配，请确认{1}', {
                '0': result.total,
                '1': result.total > 25 ? t('（显示前 25 个，请输入更完整的编号）') : '',
              })
            : t('没有匹配的有效产品'),
        );
      }
    } catch (e) {
      if (generation.current === current) setMessage((e as Error).message);
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }
  return (
    <div className="product-match">
      <div className="product-match-input">
        <input
          aria-label={t(label)}
          placeholder={t('输入编号或替代号')}
          value={query}
          maxLength={200}
          onChange={(e) => {
            generation.current++;
            setQuery(e.target.value);
            setRows([]);
            setMessage('');
            setBusy(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!busy) void match();
            }
          }}
        />
        <button type="button" disabled={busy} onClick={() => void match()}>
          {busy ? t('匹配中…') : t('匹配')}
        </button>
      </div>
      {selected && (
        <small>
          {t('已匹配：')}
          {selected}
        </small>
      )}
      {message && <small role="status">{t(message)}</small>}
      {rows.length > 0 && (
        <div className="product-match-results">
          {rows.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                generation.current++;
                onSelect(p);
                setRows([]);
                setMessage('');
                setQuery('');
                setBusy(false);
              }}
            >
              {p.sku} · {p.name}
              <small>
                {t('替代号：')}
                {p.relatedNumbers.join('、') || t('无')}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
