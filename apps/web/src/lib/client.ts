export async function request<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('auth/')) window.location.assign('/login');
    throw new Error(
      Array.isArray(data.message) ? data.message.join('；') : (data.message ?? '操作失败'),
    );
  }
  return data as T;
}
// getRandomValues also works when a LAN browser accesses the development server over HTTP.
export function requestKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const text = (value: unknown) =>
  value === null || value === undefined ? '' : String(value);
export const money = (value: unknown) =>
  new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value ?? 0),
  );
export const labels: Record<string, string> = {
  CREATE: '新建',
  UPDATE: '修改',
  CONFIRM: '确认',
  CONVERT: '单据转换',
  PAYMENT: '收付款',
  REVERSE: '冲销',
  TRANSFER: '仓库调拨',
  BANK_TRANSFER: '账户转账',
  ADJUST: '库存调整',
  REMOVE: '移除权限',
  ENABLE: '启用账号',
  DISABLE: '停用账号',
  products: '产品',
  partners: '往来单位',
  lookups: '分类资料',
  warehouses: '仓库',
  documents: '单据',
  accounts: '资金账户',
  posts: '文章',
  users: '用户权限',
  payments: '资金流水',
  inventory: '库存',
  company: '公司资料',
  companies: '公司',

  ADMIN: '管理员',
  MANAGER: '业务经理',
  SALES: '销售',
  PURCHASING: '采购',
  WAREHOUSE: '仓管',
  FINANCE: '财务',
  VIEWER: '只读',
  STOCK: '库存产品',
  SERVICE: '服务',
  KIT: '组合产品',
  CUSTOMER: '客户',
  SUPPLIER: '供应商',
  BOTH: '客户及供应商',
  BRAND: '品牌',
  CATEGORY: '分类',
  SERIES: '发动机系列',
  INCOTERM: '贸易术语',
  PAYMENT_TERM: '付款条件',
  PAYMENT_METHOD: '付款方式',
  SHIPMENT_METHOD: '配送方式',
  QUOTE: '报价单',
  SALE: '销售订单',
  PURCHASE: '采购订单',
  INVOICE: '客户发票',
  BILL: '供应商发票',
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PARTIAL: '部分履约',
  FULFILLED: '已完成',
  VOID: '已作废',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
  ITEM: '产品明细',
  NOTE: '备注',
  SUBTOTAL: '小计',
  TITLE: '分组标题',
  IN: '收款',
  OUT: '付款',
  TRANSFER_OUT: '调拨出库',
  TRANSFER_IN: '调拨入库',
  ADJUSTMENT: '库存调整',
  SHIPMENT: '销售发货',
  RECEIPT: '采购收货',
  SHIPMENT_RETURN: '销售退回',
  RECEIPT_RETURN: '采购退回',
};
export function can(role: string, area: string) {
  const grants: Record<string, string[]> = {
    catalog: ['MANAGER', 'SALES', 'PURCHASING'],
    partners: ['MANAGER', 'SALES', 'PURCHASING'],
    sales: ['MANAGER', 'SALES'],
    purchasing: ['MANAGER', 'PURCHASING'],
    inventory: ['MANAGER', 'WAREHOUSE'],
    finance: ['MANAGER', 'FINANCE'],
    content: ['MANAGER'],
    settings: [],
  };
  return role === 'ADMIN' || !!grants[area]?.includes(role);
}
export const areaFor = (kind: string) =>
  ['INVOICE', 'BILL'].includes(kind) ? 'finance' : kind === 'PURCHASE' ? 'purchasing' : 'sales';
export type Row = Record<string, unknown> & { id: string };
export interface Product extends Row {
  sku: string;
  name: string;
  type: string;
  salePrice: string;
  costPrice: string;
  taxRate: string;
  relatedNumbers: string[];
  components: { productId: string; quantity: string }[];
}
export interface Partner extends Row {
  name: string;
  type: string;
}
export interface Bootstrap {
  company: { id: string; name: string; currency: string; address: string; taxNumber: string };
  products: Product[];
  partners: Partner[];
  warehouses: Row[];
  accounts: Row[];
  lookups: Row[];
  role: string;
}
export interface DocLine {
  id?: string;
  position?: number;
  kind: string;
  freeText?: boolean;
  level?: number;
  hidden?: boolean;
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost?: string;
  discountRate: string;
  taxRate: string;
  net?: string;
  tax?: string;
  total?: string;
  fulfilled?: string;
}
export interface Document extends Row {
  kind: string;
  number: string;
  status: string;
  partnerId: string;
  partner: { name: string };
  partnerSnapshot: {
    name: string;
    address: string;
    taxNumber: string;
    contact: string;
    email: string;
  };
  currency: string;
  exchangeRate: string;
  discountRate: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  paidAmount: string;
  date: string;
  dueDate: string | null;
  validUntil: string | null;
  deliveryDate: string | null;
  customerReference: string;
  paymentTerms: string;
  paymentMethod: string;
  shippingMethod: string;
  incotermLocation: string;
  privateNotes: string;
  quoteDecision: string;
  decisionReason: string;
  incoterm: string;
  notes: string;
  version: number;
  lines: DocLine[];
  children: { id: string; number: string; kind: string; status: string }[];
  source: { id: string; number: string } | null;
  payments: Row[];
  operations: Row[];
}

export const price = (value: unknown) =>
  new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(
    Number(value ?? 0),
  );
