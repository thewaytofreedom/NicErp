'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  request,
  requestKey,
  text,
  money,
  price,
  labels,
  can,
  type Bootstrap,
  type Row,
} from '@/lib/client';
import { fieldsFor } from '@/lib/forms';
import { parseCSV, downloadCSV } from '@/lib/csv';
import MasterForm from './master-form';
import { Dialog, Empty, ErrorMessage } from './ui';
interface Tab {
  name: string;
  resource: string;
  kind?: string;
  area?: string;
}
const tabs: Record<string, Tab[]> = {
  products: [
    { name: '产品与服务', resource: 'products', area: 'catalog' },
    { name: '品牌 / 分类 / 系列', resource: 'lookups', area: 'catalog' },
  ],
  partners: [
    { name: '往来单位', resource: 'partners', area: 'partners' },
    { name: '联系人', resource: 'contacts', area: 'partners' },
  ],
  sales: [
    { name: '报价单', resource: 'documents', kind: 'QUOTE', area: 'sales' },
    { name: '销售订单', resource: 'documents', kind: 'SALE', area: 'sales' },
  ],
  purchasing: [
    { name: '采购订单', resource: 'documents', kind: 'PURCHASE', area: 'purchasing' },
    { name: '供应商价目表', resource: 'supplier-prices', area: 'purchasing' },
  ],
  inventory: [
    { name: '实时库存', resource: 'stock', area: 'inventory' },
    { name: '组合可用库存', resource: 'kit-stock' },
    { name: '库存流水', resource: 'movements' },
    { name: '仓库管理', resource: 'warehouses', area: 'inventory' },
  ],
  finance: [
    { name: '客户发票', resource: 'documents', kind: 'INVOICE', area: 'finance' },
    { name: '供应商发票', resource: 'documents', kind: 'BILL', area: 'finance' },
    { name: '收付款流水', resource: 'payments', area: 'finance' },
    { name: '资金账户', resource: 'accounts', area: 'finance' },
    { name: '毛利统计', resource: 'margins' },
    { name: '资金收支与对账', resource: 'bank-entries', area: 'finance' },
  ],
  content: [{ name: '网站文章', resource: 'posts', area: 'content' }],
  settings: [
    { name: '公司资料', resource: 'company', area: 'settings' },
    { name: '用户权限', resource: 'users', area: 'settings' },
    { name: '操作日志', resource: 'audit', area: 'settings' },
    { name: '修改密码', resource: 'password' },
  ],
};
const columns: Record<string, [string, string][]> = {
  'kit-stock': [
    ['sku', '组合编号'],
    ['name', '组合产品'],
    ['quantity', '可组装数量'],
    ['availability', '各仓可组装数量'],
    ['costPrice', '组成成本'],
  ],
  'bank-entries': [
    ['date', '日期'],
    ['account.name', '账户'],
    ['account.currency', '币种'],
    ['operation.kind', '业务'],
    ['amount', '金额'],
    ['category', '类别'],
    ['reference', '参考号'],
    ['note', '说明'],
    ['statementNumber', '对账单编号'],
    ['reconciledAt', '对账时间'],
    ['operation.reversedAt', '冲销时间'],
  ],
  margins: [
    ['name', '统计对象'],
    ['revenue', '本位币未税收入'],
    ['cost', '本位币成本'],
    ['grossProfit', '毛利'],
    ['marginRate', '毛利率%'],
    ['markupRate', '加价率%'],
  ],
  contacts: [
    ['partner.name', '往来单位'],
    ['name', '姓名'],
    ['role', '职务'],
    ['email', '邮箱'],
    ['phone', '电话'],
    ['active', '启用'],
  ],
  'supplier-prices': [
    ['product.sku', '产品编号'],
    ['product.name', '产品'],
    ['partner.name', '供应商'],
    ['supplierSku', '供应商编号'],
    ['currency', '币种'],
    ['unitPrice', '单价'],
    ['minQuantity', '最小数量'],
    ['discountRate', '折扣%'],
    ['leadDays', '交货天数'],
    ['validUntil', '有效期'],
    ['active', '启用'],
  ],
  products: [
    ['sku', '编号'],
    ['name', '名称'],
    ['type', '类型'],
    ['salePrice', '参考售价'],
    ['costPrice', '参考成本'],
    ['active', '启用'],
    ['published', '展示'],
  ],
  partners: [
    ['code', '编号'],
    ['name', '名称'],
    ['type', '类型'],
    ['contact', '联系人'],
    ['phone', '电话'],
    ['active', '启用'],
  ],
  lookups: [
    ['kind', '类型'],
    ['name', '名称'],
  ],
  warehouses: [
    ['code', '编号'],
    ['name', '仓库名称'],
    ['address', '地址'],
    ['active', '启用'],
  ],
  stock: [
    ['product.sku', '产品编号'],
    ['product.name', '产品名称'],
    ['warehouse.name', '仓库'],
    ['quantity', '现存数量'],
  ],
  movements: [
    ['operation.createdAt', '时间'],
    ['operation.kind', '业务'],
    ['product.sku', '产品编号'],
    ['operation.warehouse.name', '仓库'],
    ['quantity', '变动数量'],
    ['balanceAfter', '结余'],
    ['operation.document.number', '关联单据'],
    ['operation.note', '备注'],
  ],
  accounts: [
    ['name', '账户'],
    ['currency', '币种'],
    ['openingBalance', '期初余额'],
    ['balance', '当前余额'],
    ['active', '启用'],
  ],
  payments: [
    ['date', '日期'],
    ['document.number', '单据'],
    ['account.name', '账户'],
    ['direction', '方向'],
    ['amount', '金额'],
    ['document.currency', '币种'],
    ['reference', '参考号'],
    ['reversedAt', '冲销时间'],
    ['statementNumber', '对账单编号'],
    ['reconciledAt', '对账时间'],
  ],
  posts: [
    ['title', '标题'],
    ['slug', '路径'],
    ['status', '状态'],
    ['updatedAt', '更新时间'],
  ],
  users: [
    ['name', '姓名'],
    ['email', '邮箱'],
    ['role', '公司角色'],
    ['active', '账号启用'],
  ],
  audit: [
    ['createdAt', '时间'],
    ['actorName', '操作人'],
    ['action', '操作'],
    ['resource', '模块'],
    ['detail', '说明'],
  ],
  documents: [
    ['number', '单号'],
    ['partner.name', '往来单位'],
    ['date', '日期'],
    ['status', '状态'],
    ['currency', '币种'],
    ['total', '总额'],
    ['paidAmount', '已付'],
  ],
};
function value(row: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined),
      row,
    );
}
function display(v: unknown, key: string) {
  if (['salePrice', 'costPrice'].includes(key)) return price(v);
  if (typeof v === 'boolean') return v ? '是' : '否';
  if (!v && v !== 0) return '—';
  if (/At$/.test(key) || key === 'date') return text(v).replace('T', ' ').slice(0, 16);
  if (
    [
      'salePrice',
      'costPrice',
      'total',
      'paidAmount',
      'openingBalance',
      'balance',
      'amount',
    ].includes(key)
  )
    return money(v);
  return labels[text(v)] ?? text(v);
}
export default function Workspace({ slug, initialTab = 0 }: { slug: string; initialTab?: number }) {
  const router = useRouter(),
    available = tabs[slug],
    [tabIndex, setTab] = useState(initialTab),
    tab = available[tabIndex] ?? available[0];
  const [boot, setBoot] = useState<Bootstrap | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0),
    [editing, setEditing] = useState<Row | null | undefined>(undefined),
    [special, setSpecial] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [reportGroup, setReportGroup] = useState('product'),
    [dateFrom, setDateFrom] = useState(''),
    [dateTo, setDateTo] = useState('');
  const reportQuery =
    tab.resource === 'margins' ? `&group=${reportGroup}&from=${dateFrom}&to=${dateTo}` : '';
  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    router.refresh();
  }, [router]);
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError('');
    Promise.all([
      request<Bootstrap>('erp/bootstrap'),
      ['company', 'password'].includes(tab.resource)
        ? Promise.resolve({ rows: [], total: 0 })
        : request<{ rows: Row[]; total: number }>(
            `erp/${tab.resource}?page=${page}&q=${encodeURIComponent(query)}${tab.kind ? '&kind=' + tab.kind : ''}${reportQuery}`,
          ),
    ])
      .then(([b, data]) => {
        if (!disposed) {
          setBoot(b);
          setRows(data.rows);
          setTotal(data.total);
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [tab.resource, tab.kind, page, query, version, reportQuery]);
  const allowed = !!boot && !!tab.area && can(boot.role, tab.area),
    cols = columns[tab.resource] ?? [];
  function changeTab(i: number) {
    setTab(i);
    setPage(1);
    setQuery('');
    setSearch('');
    setNotice('');
    router.replace(`/modules/${slug}?tab=${i}`, { scroll: false });
  }
  async function exportRows() {
    setBusy(true);
    setError('');
    try {
      const all: Row[] = [];
      for (let p = 1; p <= 400; p++) {
        const d = await request<{ rows: Row[]; total: number }>(
          `erp/${tab.resource}?page=${p}&q=${encodeURIComponent(query)}${tab.kind ? '&kind=' + tab.kind : ''}${reportQuery}`,
        );
        all.push(...d.rows);
        if (all.length >= d.total) break;
        if (p === 400) throw Error('导出超过 10,000 条，请缩小筛选范围');
      }
      downloadCSV(
        `${tab.name}.csv`,
        cols.map((c) => c[1]),
        all.map((r) => cols.map(([k]) => display(value(r, k), k))),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importRows(file: File) {
    setBusy(true);
    setError('');
    try {
      if (file.size > 1000000) throw Error('文件不能超过 1MB');
      const parsed = parseCSV(await file.text());
      if (parsed.length > 200 || !parsed.length) throw Error('每次导入 1–200 行');
      const fields = fieldsFor(tab.resource, boot!).filter(
        (f) => !['parts', 'tags', 'checkbox', 'password'].includes(f.type ?? ''),
      );
      const converted = parsed.map((row) =>
        Object.fromEntries(
          fields
            .filter((f) => row[f.label] !== undefined)
            .map((f) => {
              const raw = row[f.label];
              return [f.key, f.options?.find((o) => o.label === raw)?.value ?? raw];
            }),
        ),
      );
      const result = await request<{ created: number; errors: { row: number; message: string }[] }>(
        `erp/import/${tab.resource}`,
        'POST',
        { rows: converted },
      );
      setNotice(
        `导入成功 ${result.created} 条。${result.errors.map((e) => `第 ${e.row} 行：${e.message}`).join('；')}`,
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function simpleAction(path: string, body: unknown = {}, method = 'POST') {
    setBusy(true);
    setError('');
    try {
      await request(path, method, body);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="tabs" role="tablist">
        {available.map((t, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={tabIndex === i}
            className={tabIndex === i ? 'selected' : ''}
            onClick={() => changeTab(i)}
          >
            {t.name}
          </button>
        ))}
      </div>
      <ErrorMessage error={error} />
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <div className="table-empty">加载中…</div>
      ) : (
        boot && (
          <>
            {tab.resource === 'company' ? (
              <section className="panel">
                <h2>{boot.company.name}</h2>
                <dl>
                  <dt>本位币</dt>
                  <dd>{boot.company.currency}</dd>
                  <dt>公司地址</dt>
                  <dd>{boot.company.address || '未填写'}</dd>
                  <dt>税务编号</dt>
                  <dd>{boot.company.taxNumber || '未填写'}</dd>
                </dl>
                {allowed && (
                  <div className="toolbar">
                    <button onClick={() => setEditing(boot.company)}>编辑公司</button>
                    <button onClick={() => setSpecial('companies')}>＋ 新建公司</button>
                  </div>
                )}
              </section>
            ) : tab.resource === 'password' ? (
              <form
                className="panel compact"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError('');
                  try {
                    await request(
                      'auth/password',
                      'POST',
                      Object.fromEntries(new FormData(e.currentTarget)),
                    );
                    window.location.assign('/login');
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                <label>
                  原密码
                  <input
                    type="password"
                    name="oldPassword"
                    required
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  新密码
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
                <button className="primary" disabled={busy}>
                  修改并重新登录
                </button>
              </form>
            ) : (
              <>
                <div className="toolbar">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setPage(1);
                      setQuery(search);
                    }}
                    className="search-form"
                  >
                    <input
                      aria-label="搜索"
                      placeholder="搜索编号或名称…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button>搜索</button>
                  </form>
                  <div className="toolbar-actions">
                    {tab.resource === 'bank-entries' && allowed && (
                      <button onClick={() => setSpecial('bank-transfer')}>账户转账</button>
                    )}
                    {tab.resource === 'margins' && (
                      <>
                        <select
                          aria-label="毛利分组"
                          value={reportGroup}
                          onChange={(e) => {
                            setReportGroup(e.target.value);
                            setPage(1);
                          }}
                        >
                          <option value="product">按产品</option>
                          <option value="partner">按客户</option>
                          <option value="document">按发票</option>
                        </select>
                        <input
                          aria-label="毛利开始日期"
                          type="date"
                          value={dateFrom}
                          onChange={(e) => {
                            setDateFrom(e.target.value);
                            setPage(1);
                          }}
                        />
                        <input
                          aria-label="毛利结束日期"
                          type="date"
                          value={dateTo}
                          onChange={(e) => {
                            setDateTo(e.target.value);
                            setPage(1);
                          }}
                        />
                      </>
                    )}
                    <button onClick={exportRows} disabled={busy}>
                      导出 CSV
                    </button>
                    {['products', 'partners'].includes(tab.resource) && allowed && (
                      <>
                        <button
                          onClick={() => {
                            const f = fieldsFor(tab.resource, boot).filter(
                              (f) =>
                                !['parts', 'tags', 'checkbox', 'password'].includes(f.type ?? '') &&
                                !f.key.endsWith('Id'),
                            );
                            downloadCSV(
                              '导入模板.csv',
                              f.map((x) => x.label),
                              [],
                            );
                          }}
                        >
                          导入模板
                        </button>
                        <label className="button">
                          导入 CSV
                          <input
                            hidden
                            type="file"
                            accept=".csv"
                            disabled={busy}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void importRows(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </>
                    )}
                    {allowed &&
                      [
                        'products',
                        'partners',
                        'contacts',
                        'supplier-prices',
                        'bank-entries',
                        'lookups',
                        'warehouses',
                        'accounts',
                        'posts',
                        'users',
                      ].includes(tab.resource) && (
                        <button className="primary" onClick={() => setEditing(null)}>
                          ＋ 新建
                        </button>
                      )}
                    {allowed && tab.resource === 'documents' && (
                      <Link className="button primary" href={`/documents/new?kind=${tab.kind}`}>
                        ＋ 新建{tab.name}
                      </Link>
                    )}
                    {allowed && tab.resource === 'stock' && (
                      <>
                        <button onClick={() => setSpecial('transfer')}>仓库调拨</button>
                        <button className="primary" onClick={() => setSpecial('adjust')}>
                          调整库存
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {cols.map(([k, label]) => (
                          <th key={k}>{label}</th>
                        ))}
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.id ?? i}>
                          {cols.map(([key]) => (
                            <td key={key}>
                              {key === 'status' ? (
                                <span className={`status ${text(r.status).toLowerCase()}`}>
                                  {display(value(r, key), key)}
                                </span>
                              ) : (
                                display(value(r, key), key)
                              )}
                            </td>
                          ))}
                          <td className="row-actions">
                            {tab.resource === 'documents' ? (
                              <Link href={`/documents/${r.id}`}>查看</Link>
                            ) : allowed &&
                              [
                                'products',
                                'partners',
                                'contacts',
                                'supplier-prices',
                                'lookups',
                                'warehouses',
                                'accounts',
                                'posts',
                                'users',
                              ].includes(tab.resource) ? (
                              <button onClick={() => setEditing(r)}>编辑</button>
                            ) : null}
                            {tab.resource === 'posts' && <Link href={`/posts/${r.id}`}>预览</Link>}
                            {tab.resource === 'users' && allowed && (
                              <button
                                disabled={busy}
                                onClick={() => {
                                  if (confirm('移除此用户在当前公司的访问权限？'))
                                    void simpleAction(`erp/users/${r.id}`, {}, 'DELETE');
                                }}
                              >
                                移除权限
                              </button>
                            )}
                            {tab.resource === 'payments' && allowed && !r.reversedAt && (
                              <button
                                disabled={busy}
                                onClick={() => {
                                  if (confirm('冲销此笔收付款？该操作会恢复单据未付余额。'))
                                    void simpleAction(`erp/payments/${r.id}/reverse`);
                                }}
                              >
                                冲销
                              </button>
                            )}
                            {tab.resource === 'bank-entries' &&
                              allowed &&
                              !(r.operation as Row)?.reversedAt && (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void simpleAction(`erp/bank/${text(r.operationId)}/reverse`)
                                  }
                                >
                                  冲销操作
                                </button>
                              )}
                            {['bank-entries', 'payments'].includes(tab.resource) &&
                              allowed &&
                              !(tab.resource === 'payments'
                                ? r.reversedAt
                                : (r.operation as Row)?.reversedAt) && (
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    const statementNumber = r.reconciledAt
                                      ? ''
                                      : prompt('银行对账单编号');
                                    if (statementNumber !== null)
                                      void simpleAction('erp/bank/reconcile', {
                                        [tab.resource === 'payments' ? 'paymentId' : 'entryId']:
                                          r.id,
                                        reconcile: !r.reconciledAt,
                                        statementNumber,
                                      });
                                  }}
                                >
                                  {r.reconciledAt ? '取消对账' : '对账'}
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rows.length && <Empty />}
                </div>
                <div className="pagination">
                  <span>
                    共 {total} 条 · 第 {page} 页
                  </span>
                  <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    上一页
                  </button>
                  <button disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>
                    下一页
                  </button>
                </div>
                {tab.resource === 'stock' && (
                  <p className="hint">
                    现存数量为仓库实物库存；组合产品出入库按组成零件展开。订单确认不预占库存。
                  </p>
                )}
                {tab.resource === 'posts' && (
                  <p className="hint">发布状态仅保存在 NicErp，尚未连接外部展示网站。</p>
                )}
              </>
            )}
          </>
        )
      )}
      {editing !== undefined && boot && (
        <MasterForm
          resource={tab.resource}
          bootstrap={boot}
          record={editing ?? undefined}
          close={() => setEditing(undefined)}
          saved={refresh}
        />
      )}
      {special === 'companies' && boot && (
        <MasterForm
          resource="companies"
          bootstrap={boot}
          close={() => setSpecial('')}
          saved={() => window.location.reload()}
        />
      )}
      {special === 'bank-transfer' && boot && (
        <MasterForm
          resource="bank-transfer"
          bootstrap={boot}
          close={() => setSpecial('')}
          saved={refresh}
        />
      )}
      {['adjust', 'transfer'].includes(special) && boot && (
        <Adjustment
          transfer={special === 'transfer'}
          boot={boot}
          close={() => setSpecial('')}
          saved={refresh}
        />
      )}
    </>
  );
}
function Adjustment({
  boot,
  close,
  saved,
  transfer = false,
}: {
  boot: Bootstrap;
  close: () => void;
  saved: () => void;
  transfer?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [key, setKey] = useState(requestKey);
  return (
    <Dialog title={transfer ? '仓库调拨' : '库存调整'} close={() => !busy && close()}>
      <form
        onChange={() => setKey(requestKey())}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await request(transfer ? 'erp/inventory/transfer' : 'erp/inventory/adjust', 'POST', {
              ...Object.fromEntries(new FormData(e.currentTarget)),
              requestKey: key,
            });
            saved();
            close();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <label>
          仓库
          <select name="warehouseId" required>
            <option value="">请选择</option>
            {boot.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {text(w.name)}
              </option>
            ))}
          </select>
        </label>
        {transfer && (
          <label>
            调入仓库
            <select name="targetWarehouseId" required>
              <option value="">请选择</option>
              {boot.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {text(w.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          库存产品
          <select name="productId" required>
            <option value="">请选择</option>
            {boot.products
              .filter((p) => p.type === 'STOCK')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          变动数量
          <input type="number" step="0.0001" name="quantity" required />
          <small>
            {transfer
              ? '填写正数，同时记录调出和调入流水。'
              : '正数入库，负数出库；不能导致负库存。'}
          </small>
        </label>
        <label>
          调整原因
          <textarea name="note" required maxLength={1000} />
        </label>
        <ErrorMessage error={error} />
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            {busy ? '处理中…' : '确认调整'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
