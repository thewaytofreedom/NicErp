'use client';
import { useLanguage } from '@/components/locale-provider';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { request, requestKey, text, labels, can, type Bootstrap, type Row } from '@/lib/client';
import { fieldsFor } from '@/lib/forms';
import { parseCSV, downloadCSV } from '@/lib/csv';
import MasterForm from './master-form';
import UserSettings from './user-settings';
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
    { name: '客户发票', resource: 'documents', kind: 'INVOICE', area: 'sales' },
    { name: '销售发货单', resource: 'shipments', area: 'sales' },
    { name: '待发货订单', resource: 'pending-shipments', kind: 'SALE', area: 'sales' },
    { name: '收款流水', resource: 'payments', area: 'sales' },
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
  users: [{ name: '用户与权限', resource: 'users', area: 'settings' }],
  settings: [
    { name: '公司资料', resource: 'company', area: 'settings' },
    { name: '汇率管理', resource: 'exchange-rates', area: 'settings' },
    { name: '操作日志', resource: 'audit', area: 'settings' },
    { name: '修改密码', resource: 'password' },
    { name: '用户设置', resource: 'preferences' },
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
  'exchange-rates': [
    ['currency', '币种'],
    ['rate', '汇率'],
    ['active', '启用'],
  ],
  warehouses: [
    ['code', '编号'],
    ['name', '仓库名称'],
    ['type', '仓库类型'],
    ['address', '地址'],
    ['active', '启用'],
  ],
  stock: [
    ['product.sku', '产品编号'],
    ['product.name', '产品名称'],
    ['warehouse.name', '仓库'],
    ['quantity', '现存数量'],
  ],
  shipments: [
    ['number', '单号'],
    ['date', '日期'],
    ['kind', '业务'],
    ['document.number', '关联订单'],
    ['document.partnerSnapshot.name', '往来单位'],
    ['warehouse.name', '仓库'],
    ['note', '备注'],
  ],
  receipts: [
    ['number', '单号'],
    ['date', '日期'],
    ['kind', '业务'],
    ['document.number', '关联订单'],
    ['document.partnerSnapshot.name', '往来单位'],
    ['warehouse.name', '仓库'],
    ['note', '备注'],
  ],
  'pending-shipments': [
    ['number', '订单号'],
    ['kind', '类型'],
    ['status', '状态'],
    ['date', '订单日期'],
    ['partnerName', '往来单位'],
    ['remaining', '待履约数量'],
  ],
  movements: [
    ['operation.createdAt', '时间'],
    ['operation.kind', '业务'],
    ['product.sku', '产品编号'],
    ['warehouse.name', '仓库'],
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
export default function Workspace({ slug, role, initialTab = 0 }: { slug: string; role: string; initialTab?: number }) {
  const { t, money, price } = useLanguage();
  function display(v: unknown, key: string) {
    if (['salePrice', 'costPrice'].includes(key)) return price(v);
    if (typeof v === 'boolean') return v ? t('是') : t('否');
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
    return ['type', 'role', 'kind', 'status', 'action', 'resource', 'operation.kind'].includes(key)
      ? t(labels[text(v)] ?? text(v))
      : text(v);
  }
  const router = useRouter(),
    available =
      slug === 'settings' && role !== 'ADMIN'
        ? tabs[slug].filter((entry) => ['password', 'preferences'].includes(entry.resource))
        : tabs[slug],
    [tabIndex, setTab] = useState(Math.min(available.length - 1, initialTab)),
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
    [pendingOrder, setPendingOrder] = useState<Row | null>(null),
    [editingShipment, setEditingShipment] = useState<Row | null>(null),
    [passwordUser, setPasswordUser] = useState<Row | null>(null),
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
      ['company', 'password', 'preferences'].includes(tab.resource)
        ? Promise.resolve({ rows: [], total: 0 })
        : request<{
            rows: Row[];
            total: number;
          }>(
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
    cols = (columns[tab.resource] ?? []).filter(
      ([key]) => !(role === 'SALES' && key === 'costPrice'),
    );
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
        const d = await request<{
          rows: Row[];
          total: number;
        }>(
          `erp/${tab.resource}?page=${p}&q=${encodeURIComponent(query)}${tab.kind ? '&kind=' + tab.kind : ''}${reportQuery}`,
        );
        all.push(...d.rows);
        if (all.length >= d.total) break;
        if (p === 400) throw Error(t('导出超过 10,000 条，请缩小筛选范围'));
      }
      downloadCSV(
        `${t(tab.name)}.csv`,
        cols.map((c) => t(c[1])),
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
      if (file.size > 1000000) throw Error(t('文件不能超过 1MB'));
      const parsed = parseCSV(await file.text());
      if (parsed.length > 200 || !parsed.length) throw Error(t('每次导入 1–200 行'));
      const fields = fieldsFor(tab.resource, boot!).filter(
        (f) => !['parts', 'tags', 'checkbox', 'password'].includes(f.type ?? ''),
      );
      const converted = parsed.map((row) =>
        Object.fromEntries(
          fields
            .filter((f) => row[f.label] !== undefined || row[t(f.label)] !== undefined)
            .map((f) => {
              const raw = row[f.label] ?? row[t(f.label)];
              return [
                f.key,
                f.options?.find((o) => o.label === raw || t(o.label) === raw)?.value ?? raw,
              ];
            }),
        ),
      );
      const result = await request<{
        created: number;
        errors: {
          row: number;
          message: string;
        }[];
      }>(`erp/import/${tab.resource}`, 'POST', { rows: converted });
      setNotice(
        t('导入成功 {0} 条。{1}', {
          '0': result.created,
          '1': result.errors
            .map((e) => t('第 {0} 行：{1}', { '0': e.row, '1': e.message }))
            .join('；'),
        }),
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
        {available.map((entry, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={tabIndex === i}
            className={tabIndex === i ? 'selected' : ''}
            onClick={() => changeTab(i)}
          >
            {t(entry.name)}
          </button>
        ))}
      </div>
      <ErrorMessage error={t(error)} />
      {notice && (
        <p className="success" role="status">
          {t(notice)}
        </p>
      )}
      {loading ? (
        <div className="table-empty">{t('加载中…')}</div>
      ) : (
        boot && (
          <>
            {tab.resource === 'preferences' ? (
              <UserSettings />
            ) : tab.resource === 'company' ? (
              <section className="panel">
                <h2>{boot.company.name}</h2>
                <dl>
                  <dt>{t('本位币')}</dt>
                  <dd>{boot.company.currency}</dd>
                  <dt>{t('公司地址')}</dt>
                  <dd>{boot.company.address || t('未填写')}</dd>
                  <dt>{t('税务编号')}</dt>
                  <dd>{boot.company.taxNumber || t('未填写')}</dd>
                </dl>
                {allowed && (
                  <div className="toolbar">
                    <button onClick={() => setEditing(boot.company)}>{t('编辑公司')}</button>
                    <button onClick={() => setSpecial('companies')}>{t('＋ 新建公司')}</button>
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
                  {t('原密码')}
                  <input
                    type="password"
                    name="oldPassword"
                    required
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  {t('新密码')}
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
                  {t('修改并重新登录')}
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
                      aria-label={t('搜索')}
                      placeholder={t('搜索编号或名称…')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button>{t('搜索')}</button>
                  </form>
                  <div className="toolbar-actions">
                    {tab.resource === 'bank-entries' && allowed && (
                      <button onClick={() => setSpecial('bank-transfer')}>{t('账户转账')}</button>
                    )}
                    {tab.resource === 'margins' && (
                      <>
                        <select
                          aria-label={t('毛利分组')}
                          value={reportGroup}
                          onChange={(e) => {
                            setReportGroup(e.target.value);
                            setPage(1);
                          }}
                        >
                          <option value="product">{t('按产品')}</option>
                          <option value="partner">{t('按客户')}</option>
                          <option value="document">{t('按发票')}</option>
                        </select>
                        <input
                          aria-label={t('毛利开始日期')}
                          type="date"
                          value={dateFrom}
                          onChange={(e) => {
                            setDateFrom(e.target.value);
                            setPage(1);
                          }}
                        />
                        <input
                          aria-label={t('毛利结束日期')}
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
                      {t('导出 CSV')}
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
                              t('导入模板.csv'),
                              f.map((x) => x.label),
                              [],
                            );
                          }}
                        >
                          {t('导入模板')}
                        </button>
                        <label className="button">
                          {t('导入 CSV')}
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
                        'exchange-rates',
                        'warehouses',
                        'accounts',
                        'posts',
                        'users',
                      ].includes(tab.resource) && (
                        <button className="primary" onClick={() => setEditing(null)}>
                          {t('＋ 新建')}
                        </button>
                      )}
                    {allowed && tab.resource === 'documents' && (
                      <Link className="button primary" href={`/documents/new?kind=${tab.kind}`}>
                        {t('＋ 新建')}
                        {t(tab.name)}
                      </Link>
                    )}
                    {allowed && tab.resource === 'stock' && (
                      <>
                        <button onClick={() => setSpecial('transfer')}>{t('仓库调拨')}</button>
                        <button className="primary" onClick={() => setSpecial('adjust')}>
                          {t('调整库存')}
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
                          <th key={k}>{t(label)}</th>
                        ))}
                        <th>{t('操作')}</th>
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
                              <Link href={`/documents/${r.id}`}>{t('查看')}</Link>
                            ) : tab.resource === 'partners' ? (
                              <>
                                <Link href={`/partners/${r.id}`}>{t('查看档案')}</Link>
                                {allowed && (
                                  <button onClick={() => setEditing(r)}>{t('编辑')}</button>
                                )}
                              </>
                            ) : allowed &&
                              [
                                'products',
                                'partners',
                                'contacts',
                                'supplier-prices',
                                'lookups',
                                'exchange-rates',
                                'warehouses',
                                'accounts',
                                'posts',
                                'users',
                              ].includes(tab.resource) ? (
                              <button onClick={() => setEditing(r)}>{t('编辑')}</button>
                            ) : null}
                            {tab.resource === 'posts' && (
                              <Link href={`/posts/${r.id}`}>{t('预览')}</Link>
                            )}
                            {['shipments', 'receipts'].includes(tab.resource) && (
                              <Link href={`/shipments/${r.id}/print`} target="_blank">
                                {t('打印发货单')}
                              </Link>
                            )}
                            {tab.resource === 'shipments' && r.kind === 'SHIPMENT' && allowed && (
                              <>
                                <button onClick={() => setEditingShipment(r)}>{t('编辑')}</button>
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    if (confirm(t('确认删除此销售发货单？库存和订单已发数量将同步回滚。')))
                                      void simpleAction(`erp/shipments/${r.id}`, {}, 'DELETE');
                                  }}
                                >
                                  {t('删除')}
                                </button>
                              </>
                            )}
                            {tab.resource === 'pending-shipments' && allowed && (
                                <button
                                  onClick={() => {
                                    setPendingOrder(r);
                                  }}
                                >
                                  {r.kind === 'SALE' ? t('登记发货') : t('登记收货')}
                                </button>
                              )}
                            {tab.resource === 'pending-shipments' && (
                              <Link href={`/documents/${r.id}`}>{t('查看')}</Link>
                            )}
                            {tab.resource === 'users' && allowed && (
                              <>
                                <button onClick={() => setPasswordUser(r)}>{t('修改密码')}</button>
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    if (confirm(t('确认删除此用户？如果该账号还属于其他公司，只会移除当前公司的访问权限。')))
                                      void simpleAction(`erp/users/${r.id}`, {}, 'DELETE');
                                  }}
                                >
                                  {t('删除用户')}
                                </button>
                              </>
                            )}
                            {tab.resource === 'payments' && allowed && (
                              <button
                                disabled={busy}
                                onClick={() => {
                                  if (confirm(t('冲销此笔收付款？该操作会删除记录并恢复单据未付余额。')))
                                    void simpleAction(`erp/payments/${r.id}/reverse`);
                                }}
                              >
                                {t('冲销')}
                              </button>
                            )}
                            {tab.resource === 'bank-entries' && allowed && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void simpleAction(`erp/bank/${text(r.operationId)}/reverse`)
                                }
                              >
                                {t('冲销操作')}
                              </button>
                            )}
                            {['bank-entries', 'payments'].includes(tab.resource) &&
                              allowed && (
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    const statementNumber = r.reconciledAt
                                      ? ''
                                      : prompt(t('银行对账单编号'));
                                    if (statementNumber !== null)
                                      void simpleAction('erp/bank/reconcile', {
                                        [tab.resource === 'payments' ? 'paymentId' : 'entryId']:
                                          r.id,
                                        reconcile: !r.reconciledAt,
                                        statementNumber,
                                      });
                                  }}
                                >
                                  {r.reconciledAt ? t('取消对账') : t('对账')}
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
                    {t('共')}
                    {total}
                    {t('条 · 第')}
                    {page}
                    {t('页')}
                  </span>
                  <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    {t('上一页')}
                  </button>
                  <button disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>
                    {t('下一页')}
                  </button>
                </div>
                {tab.resource === 'stock' && (
                  <p className="hint">
                    {t(
                      '现存数量为仓库实物库存；组合产品出入库按组成零件展开。订单确认不预占库存。',
                    )}
                  </p>
                )}
                {tab.resource === 'posts' && (
                  <p className="hint">{t('发布状态仅保存在 NicErp，尚未连接外部展示网站。')}</p>
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
      {pendingOrder && boot && (
        <ShipmentDialog
          order={pendingOrder}
          boot={boot}
          close={() => setPendingOrder(null)}
          saved={refresh}
        />
      )}
      {editingShipment && boot && (
        <ShipmentEditDialog
          shipment={editingShipment}
          boot={boot}
          close={() => setEditingShipment(null)}
          saved={refresh}
        />
      )}
      {passwordUser && (
        <UserPasswordDialog
          user={passwordUser}
          close={() => setPasswordUser(null)}
          saved={refresh}
        />
      )}
    </>
  );
}
function UserPasswordDialog({
  user,
  close,
  saved,
}: {
  user: Row;
  close: () => void;
  saved: () => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Dialog title={t('修改用户密码')} close={() => !busy && close()}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          const form = new FormData(event.currentTarget),
            password = text(form.get('password')),
            confirmPassword = text(form.get('confirmPassword'));
          try {
            if (password !== confirmPassword) throw Error(t('两次输入的密码不一致'));
            await request(`erp/users/${user.id}/password`, 'PATCH', { password });
            saved();
            close();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <p className="hint">
          {text(user.name)} · {text(user.email)}
        </p>
        <label>
          {t('新密码')}
          <input name="password" type="password" minLength={12} maxLength={128} required />
          <small>{t('至少 12 位；保存后该用户的现有会话将全部退出。')}</small>
        </label>
        <label>
          {t('确认新密码')}
          <input name="confirmPassword" type="password" minLength={12} maxLength={128} required />
        </label>
        <ErrorMessage error={t(error)} />
        <div className="form-actions">
          <button type="button" onClick={close} disabled={busy}>{t('取消')}</button>
          <button className="primary" disabled={busy}>{busy ? t('保存中…') : t('保存密码')}</button>
        </div>
      </form>
    </Dialog>
  );
}
function ShipmentEditDialog({
  shipment,
  boot,
  close,
  saved,
}: {
  shipment: Row;
  boot: Bootstrap;
  close: () => void;
  saved: () => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [lineFilter, setLineFilter] = useState('');
  const document = shipment.document as Row | undefined,
    lines = (document?.lines as Row[]) ?? [],
    previous = new Map(
      (((shipment.lineQuantities as Row[]) ?? []).map((line) => [text(line.lineId), text(line.quantity)])),
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      await request(`erp/shipments/${shipment.id}`, 'PATCH', {
        warehouseId: form.get('warehouseId'),
        date: form.get('date'),
        note: form.get('note'),
        lines: lines
          .map((line) => ({ lineId: line.id, quantity: text(form.get(text(line.id))) }))
          .filter((line) => Number(line.quantity) > 0),
      });
      saved();
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Dialog title={t('编辑销售发货单')} close={() => !busy && close()} wide>
      <form onSubmit={submit}>
        <p className="hint">
          {t('发货单')} {text(shipment.number)} · {t('关联订单')} {text(document?.number)}
        </p>
        <label>
          {t('仓库')}
          <select name="warehouseId" required defaultValue={text(shipment.warehouseId)}>
            {boot.warehouses.filter((warehouse) => warehouse.type === 'PHYSICAL').map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {text(warehouse.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('业务日期')}
          <input name="date" type="date" required defaultValue={text(shipment.date).slice(0, 10)} />
        </label>
        <p className="hint">{t('修改数量后，库存和订单已发数量会同步调整。')}</p>
        <input
          className="line-filter"
          type="search"
          value={lineFilter}
          onChange={(e) => setLineFilter(e.target.value)}
          placeholder={t('筛选明细、产品编号或描述')}
          aria-label={t('筛选发货明细')}
        />
        <div className="shipment-lines">
        {lines.map((line) => {
          const oldQuantity = Number(previous.get(text(line.id)) ?? 0),
            available = Number(line.quantity) - Number(line.fulfilled) + oldQuantity,
            hidden = !!lineFilter.trim() && !text(line.description).toLocaleLowerCase().includes(lineFilter.trim().toLocaleLowerCase());
          return (
            <label key={text(line.id)} hidden={hidden}>
              {text(line.description)}
              <input
                aria-label={text(line.description) + t(' 本次数量')}
                name={text(line.id)}
                type="number"
                step="0.0001"
                min="0"
                max={available}
                defaultValue={oldQuantity || ''}
              />
              <small>
                {t('本次原数量')}：{oldQuantity} · {t('最多可发')}：{available}
              </small>
            </label>
          );
        })}
        </div>
        <label>
          {t('备注')}
          <textarea name="note" maxLength={1000} defaultValue={text(shipment.note)} />
        </label>
        <ErrorMessage error={t(error)} />
        <div className="form-actions">
          <button type="button" onClick={close} disabled={busy}>
            {t('取消')}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t('处理中…') : t('保存')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function ShipmentDialog({
  order,
  boot,
  close,
  saved,
}: {
  order: Row;
  boot: Bootstrap;
  close: () => void;
  saved: () => void;
}) {
  const { t } = useLanguage();
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [key, setKey] = useState(requestKey),
    [lineFilter, setLineFilter] = useState('');
  const lines = (order.lines as Row[]) ?? [],
    sale = order.kind === 'SALE',
    [quantities, setQuantities] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        lines.map((line) => [
          text(line.id),
          String(Math.max(0, Number(line.quantity) - Number(line.fulfilled))),
        ]),
      ),
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const result = await request<{ id: string; number?: string }>(
        `erp/documents/${order.id}/fulfill`,
        'POST',
        {
          warehouseId: f.get('warehouseId'),
          note: f.get('note'),
          date: f.get('date'),
          requestKey: key,
          action: 'FULFILL',
          lines: lines
            .map((l) => ({ lineId: l.id, quantity: quantities[text(l.id)] ?? '0' }))
            .filter((l) => Number(l.quantity) > 0),
        },
      );
      saved();
      close();
      if (result.id) router.push(`/shipments/${result.id}/print`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={sale ? t('登记发货') : t('登记收货')}
      close={() => !busy && close()}
      wide
    >
      <form onSubmit={submit} onChange={() => setKey(requestKey())}>
        <p className="hint">
          {t('订单')}
          {text(order.number)} · {text(order.partnerName)} · {t('待履约数量')}
          {text(order.remaining)}
        </p>
        <label>
          {t('仓库')}
          <select
            name="warehouseId"
            required
            defaultValue={text(boot.warehouses.find((warehouse) => warehouse.type === 'PHYSICAL')?.id)}
          >
            <option value="">{t('请选择仓库')}</option>
            {boot.warehouses.filter((w) => w.type === 'PHYSICAL').map((w) => (
              <option key={w.id} value={w.id}>
                {text(w.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('业务日期')}
          <input
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          <small>{t('将作为发货单 / 收货单日期。')}</small>
        </label>
        <p className="hint">{t('填写本次数量，0 表示跳过。')}</p>
        <div className="toolbar-actions">
          <button
            type="button"
            onClick={() =>
              setQuantities(
                Object.fromEntries(
                  lines.map((line) => [
                    text(line.id),
                    String(Math.max(0, Number(line.quantity) - Number(line.fulfilled))),
                  ]),
                ),
              )
            }
          >
            {t('一键填充全部数量')}
          </button>
          <button
            type="button"
            onClick={() =>
              setQuantities(Object.fromEntries(lines.map((line) => [text(line.id), '0'])))
            }
          >
            {t('全部清零')}
          </button>
        </div>
        <input
          className="line-filter"
          type="search"
          value={lineFilter}
          onChange={(e) => setLineFilter(e.target.value)}
          placeholder={t('筛选明细、产品编号或描述')}
          aria-label={t('筛选发货明细')}
        />
        <div className="shipment-lines">
        {lines.map((l) => {
          const remaining = Number(l.quantity) - Number(l.fulfilled),
            hidden = !!lineFilter.trim() && !text(l.description).toLocaleLowerCase().includes(lineFilter.trim().toLocaleLowerCase());
          return (
            <label key={text(l.id)} hidden={hidden}>
              {text(l.description)}
              <input
                aria-label={text(l.description) + t(' 本次数量')}
                name={text(l.id)}
                type="number"
                step="0.0001"
                min="0"
                max={remaining}
                value={quantities[text(l.id)] ?? '0'}
                onChange={(event) =>
                  setQuantities((current) => ({
                    ...current,
                    [text(l.id)]: event.target.value,
                  }))
                }
              />
              <small>
                {t('尚未履约')}：{remaining}
              </small>
            </label>
          );
        })}
        </div>
        <label>
          {t('备注')}
          <textarea name="note" maxLength={1000} />
        </label>
        <ErrorMessage error={t(error)} />
        <div className="form-actions">
          <button type="button" onClick={close} disabled={busy}>
            {t('取消')}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t('处理中…') : sale ? t('确认发货') : t('确认收货')}
          </button>
        </div>
      </form>
    </Dialog>
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
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [key, setKey] = useState(requestKey);
  return (
    <Dialog title={transfer ? t('仓库调拨') : t('库存调整')} close={() => !busy && close()}>
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
          {t('仓库')}
          <select name="warehouseId" required>
            <option value="">{t('请选择')}</option>
            {boot.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {text(w.name)}
              </option>
            ))}
          </select>
        </label>
        {transfer && (
          <label>
            {t('调入仓库')}
            <select name="targetWarehouseId" required>
              <option value="">{t('请选择')}</option>
              {boot.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {text(w.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t('库存产品')}
          <select name="productId" required>
            <option value="">{t('请选择')}</option>
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
          {t('变动数量')}
          <input type="number" step="0.0001" name="quantity" required />
          <small>
            {transfer
              ? t('填写正数，同时记录调出和调入流水。')
              : t('正数入库，负数出库；实体仓库不能为负数，虚拟仓库允许负数。')}
          </small>
        </label>
        <label>
          {t('调整原因')}
          <textarea name="note" required maxLength={1000} />
        </label>
        <ErrorMessage error={t(error)} />
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            {busy ? t('处理中…') : t('确认调整')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
