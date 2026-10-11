import type { Bootstrap, Row } from './client';
import { text, labels } from './client';
export interface Field {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'number'
    | 'textarea'
    | 'select'
    | 'checkbox'
    | 'tags'
    | 'parts'
    | 'email'
    | 'password'
    | 'date'
    | 'product';
  required?: boolean;
  options?: { value: string; label: string }[];
  default?: string | boolean;
  hint?: string;
}
const options = (values: string[]) =>
  values.map((value) => ({ value, label: labels[value] ?? value }));
const refs = (rows: Row[]) => rows.map((r) => ({ value: r.id, label: text(r.name) }));
export function fieldsFor(resource: string, b: Bootstrap, editing = false): Field[] {
  const name: Field = { key: 'name', label: '名称', required: true },
    active: Field = { key: 'active', label: '启用', type: 'checkbox', default: true };
  switch (resource) {
    case 'bank-entries':
    case 'bank-transfer':
      return [
        {
          key: 'accountId',
          label: resource === 'bank-transfer' ? '调出账户' : '资金账户',
          type: 'select',
          required: true,
          options: refs(b.accounts),
        },
        ...(resource === 'bank-transfer'
          ? [
              {
                key: 'targetAccountId',
                label: '调入账户',
                type: 'select' as const,
                required: true,
                options: refs(b.accounts),
              },
            ]
          : [
              {
                key: 'direction',
                label: '方向',
                type: 'select' as const,
                required: true,
                options: options(['IN', 'OUT']),
                default: 'IN',
              },
            ]),
        { key: 'amount', label: '金额', type: 'number', required: true },
        {
          key: 'date',
          label: '日期',
          type: 'date',
          required: true,
          default: new Date().toISOString().slice(0, 10),
        },
        { key: 'reference', label: '参考号' },
        { key: 'category', label: '收支类别' },
        { key: 'note', label: '说明', type: 'textarea' },
      ];
    case 'contacts':
      return [
        {
          key: 'partnerId',
          label: '所属往来单位',
          type: 'select',
          required: true,
          options: refs(b.partners),
        },
        name,
        { key: 'role', label: '联系人角色 / 职务' },
        { key: 'email', label: '邮箱', type: 'email' },
        { key: 'phone', label: '电话' },
        { key: 'address', label: '联系地址', type: 'textarea' },
        { key: 'notes', label: '备注', type: 'textarea' },
        active,
      ];
    case 'supplier-prices':
      return [
        { key: 'productId', label: '产品编号 / 替代号', type: 'product', required: true },
        {
          key: 'partnerId',
          label: '供应商',
          type: 'select',
          required: true,
          options: refs(b.partners.filter((p) => ['SUPPLIER', 'BOTH'].includes(p.type))),
        },
        { key: 'supplierSku', label: '供应商产品编号' },
        { key: 'currency', label: '报价币种', default: b.company.currency, required: true },
        {
          key: 'exchangeRate',
          label: '报价汇率（1 报价币种 = 本位币）',
          type: 'number',
          default: '1',
          required: true,
        },
        { key: 'unitPrice', label: '供应商单价', type: 'number', default: '0', required: true },
        {
          key: 'minQuantity',
          label: '最小订购数量 / 价阶起点',
          type: 'number',
          default: '1',
          required: true,
        },
        { key: 'discountRate', label: '折扣 %', type: 'number', default: '0' },
        { key: 'leadDays', label: '交货天数', type: 'number', default: '0' },
        { key: 'validUntil', label: '报价有效期', type: 'date' },
        active,
      ];
    case 'products':
      return [
        { key: 'sku', label: '产品编号 / 零件号', required: true },
        name,
        {
          key: 'type',
          label: '产品类型',
          type: 'select',
          options: options(['STOCK', 'SERVICE', 'KIT']),
          default: 'STOCK',
        },
        { key: 'unit', label: '单位', default: '件' },
        { key: 'model', label: '型号' },
        {
          key: 'sourceTag',
          label: '货源标签',
          hint: '例如 DCEC2026、SN2026、WD，用于报价货源偏好匹配',
        },
        { key: 'saleEnabled', label: '可销售', type: 'checkbox', default: true },
        { key: 'purchaseEnabled', label: '可采购', type: 'checkbox', default: true },
        ...(['brandId', 'categoryId', 'seriesId'] as const).map((key, i): Field => ({
          key,
          label: ['品牌', '分类', '发动机系列'][i],
          type: 'select',
          options: refs(b.lookups.filter((x) => x.kind === ['BRAND', 'CATEGORY', 'SERIES'][i])),
        })),
        {
          key: 'salePrice',
          label: `参考售价 (${b.company.currency})`,
          type: 'number',
          default: '0',
        },
        {
          key: 'costPrice',
          label: `参考成本 (${b.company.currency})`,
          type: 'number',
          default: '0',
        },
        { key: 'taxRate', label: '默认税率 %', type: 'number', default: '0' },
        { key: 'relatedNumbers', label: '关联 / 替代零件号', type: 'tags', hint: '每行一个编号' },
        { key: 'description', label: '产品说明', type: 'textarea' },
        { key: 'imageUrls', label: '图片链接', type: 'tags', hint: '每行一个 http/https 图片链接' },
        {
          key: 'components',
          label: '组合产品组成',
          type: 'parts',
          hint: '仅组合产品填写；可嵌套组合，禁止循环引用',
        },
        { key: 'published', label: '标记为可对外展示', type: 'checkbox' },
        active,
      ];
    case 'partners':
      return [
        { key: 'code', label: '编号', required: true },
        name,
        {
          key: 'type',
          label: '往来类型',
          type: 'select',
          options: options(['CUSTOMER', 'SUPPLIER', 'BOTH']),
          default: 'CUSTOMER',
        },
        { key: 'contact', label: '联系人' },
        { key: 'email', label: '邮箱', type: 'email' },
        { key: 'phone', label: '电话' },
        { key: 'address', label: '地址', type: 'textarea' },
        { key: 'taxNumber', label: '税务编号' },
        { key: 'notes', label: '备注', type: 'textarea' },
        active,
      ];
    case 'lookups':
      return [
        {
          key: 'kind',
          label: '资料类型',
          type: 'select',
          options: options([
            'BRAND',
            'CATEGORY',
            'SERIES',
            'INCOTERM',
            'PAYMENT_TERM',
            'PAYMENT_METHOD',
            'SHIPMENT_METHOD',
          ]),
          default: 'BRAND',
        },
        name,
      ];
    case 'warehouses':
      return [
        { key: 'code', label: '仓库编号', required: true },
        name,
        { key: 'address', label: '仓库地址', type: 'textarea' },
        active,
      ];
    case 'accounts':
      return [
        name,
        {
          key: 'type',
          label: '账户类型',
          type: 'select',
          options: [
            { value: 'BANK', label: '银行' },
            { value: 'CASH', label: '现金' },
          ],
          default: 'BANK',
        },
        { key: 'bankName', label: '开户行' },
        { key: 'accountNumber', label: '账号' },
        { key: 'iban', label: 'IBAN' },
        { key: 'bic', label: 'BIC / SWIFT' },
        { key: 'currency', label: '币种', default: b.company.currency, required: true },
        { key: 'openingBalance', label: '期初余额', type: 'number', default: '0' },
        active,
      ];
    case 'posts':
      return [
        { key: 'title', label: '标题', required: true },
        {
          key: 'slug',
          label: '文章路径',
          required: true,
          hint: '例如 company-news，仅小写字母、数字和连字符',
        },
        { key: 'excerpt', label: '摘要', type: 'textarea' },
        { key: 'coverUrl', label: '封面图片链接' },
        {
          key: 'content',
          label: '正文',
          type: 'textarea',
          required: true,
          hint: '纯文本内容；换行保留，不执行 HTML',
        },
        {
          key: 'status',
          label: '发布状态',
          type: 'select',
          options: options(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
          default: 'DRAFT',
        },
      ];
    case 'company':
      return [
        name,
        {
          key: 'currency',
          label: '本位币',
          default: b.company.currency,
          required: true,
          hint: '有产品或单据后不能修改',
        },
        { key: 'address', label: '公司地址', type: 'textarea' },
        { key: 'taxNumber', label: '税务编号' },
      ];
    case 'companies':
      return [
        { key: 'code', label: '公司编号', required: true },
        name,
        { key: 'currency', label: '本位币', default: 'SGD', required: true },
      ];
    case 'users':
      return [
        ...(editing
          ? []
          : [
              { key: 'name', label: '姓名', required: true },
              { key: 'email', label: '邮箱', type: 'email' as const, required: true },
              {
                key: 'password',
                label: '初始密码',
                type: 'password' as const,
                hint: '新用户至少 12 位；已有用户留空，仅添加公司权限',
              },
            ]),
        {
          key: 'role',
          label: '公司角色',
          type: 'select',
          options: options([
            'ADMIN',
            'MANAGER',
            'SALES',
            'PURCHASING',
            'WAREHOUSE',
            'FINANCE',
            'VIEWER',
          ]),
          default: 'VIEWER',
        },
        {
          key: 'active',
          label: '账号启用',
          type: 'checkbox',
          default: true,
          hint: '停用将退出所有公司会话。跨公司账号须在其所有公司拥有管理员权限；添加已有账号时须保持其原状态。',
        },
      ];
    default:
      return [];
  }
}
