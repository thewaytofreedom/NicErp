export interface ModuleDefinition {
  slug: string;
  title: string;
  description: string;
  code: string;
  adminOnly?: boolean;
  roles?: string[];
}
export const modules: ModuleDefinition[] = [
  {
    slug: 'products',
    title: '产品管理',
    description: '产品、品牌、分类、系列与关联零件号',
    code: '01',
    roles: ['ADMIN', 'MANAGER', 'SALES', 'PURCHASING'],
  },
  {
    slug: 'partners',
    title: '客户与供应商',
    description: '统一维护业务往来单位与联系人',
    code: '02',
    roles: ['ADMIN', 'MANAGER', 'SALES', 'PURCHASING'],
  },
  { slug: 'sales', title: '销售管理', description: '报价、订单、发货、发票与收款业务', code: '03', roles: ['ADMIN', 'MANAGER', 'SALES'] },
  { slug: 'purchasing', title: '采购管理', description: '采购订单、供应商与收货业务', code: '04', roles: ['ADMIN', 'MANAGER', 'PURCHASING'] },
  { slug: 'inventory', title: '库存管理', description: '仓库、库存数量与出入库流水', code: '05', roles: ['ADMIN', 'MANAGER', 'WAREHOUSE'] },
  { slug: 'finance', title: '财务管理', description: '发票、收付款、多币种与毛利', code: '07', roles: ['ADMIN', 'MANAGER', 'FINANCE'] },
  { slug: 'content', title: '网站内容', description: '产品发布、新闻与展示内容', code: '08', roles: ['ADMIN', 'MANAGER'] },
  {
    slug: 'users',
    title: '用户管理',
    description: '添加、编辑、删除用户并管理角色与密码',
    code: '09',
    adminOnly: true,
    roles: ['ADMIN'],
  },
  {
    slug: 'settings',
    title: '系统设置',
    description: '公司、汇率、个人设置与审计记录',
    code: '10',
    roles: ['ADMIN', 'MANAGER', 'SALES', 'PURCHASING', 'WAREHOUSE', 'FINANCE', 'VIEWER'],
  },
];
