# NicErp User Permission Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 NicErp 增加按公司配置的角色默认权限、个人覆盖、负责人数据范围和四类敏感字段权限，并删除只读角色。

**Architecture:** 以 NestJS 中的权限注册表和有效权限解析器作为唯一规则来源，每次身份验证加载当前成员权限。Prisma 查询先应用公司和负责人范围，公开 DTO 再进行字段投影；所有写入及幂等重放独立校验。Next.js 从后端权限目录及有效权限生成管理界面和业务入口，不复制角色矩阵。

**Tech Stack:** 现有 TypeScript、NestJS 11、Prisma 7.10、PostgreSQL、Next.js App Router、React、Node test runner、Playwright；不新增授权框架或数据库依赖。

**Spec:** `docs/superpowers/specs/2026-10-12-user-permissions-design.md`

## Global Constraints

- 数据范围只有“本人”和“当前公司全部”，不增加部门、团队或跨公司共享。
- 保留管理员、经理、销售、采购、仓库、财务六个角色，删除只读角色。采用角色默认权限与个人调整，不增加自定义角色或用户组。
- 历史资料负责人留空；只有相应全公司范围的用户可见，由管理员随后分配。不得根据历史日志猜测负责人。
- 用户设置中的语言选择和修改本人密码继续向所有启用用户开放，不要求系统管理权限。
- 不恢复先前撤销的“从 CSV 生成报价”功能，也不改变原有产品编号/替代号匹配与货源规则。
- 所有自动化业务测试只写入 `nicerp_test`；运行中的业务库和 Next dev 构建目录不用于破坏性测试或生产构建。
- 修改 Web 前先阅读 `apps/web/AGENTS.md` 及本项目安装的 `node_modules/next/dist/docs/01-app/02-guides/authentication.md`、`data-security.md`、`01-getting-started/05-server-and-client-components.md`。权限必须在 API 中实施，不能仅依赖菜单或布局。
- 本项目 package.json 声明 Node `>=22.12.0 <23`，当前机器为 Node 24.21.0。执行前记录运行环境；本次不改 engines 或升级依赖。使用现有 package-lock.json。
- 当前 Git 工作目录含已上线但未提交的多语言改动；不要 reset、clean、覆盖这些改动，提交时只提交本任务的明确文件。
- 本轮只制定计划。以下复选框表示未来执行步骤，尚未实施、尚未测试。

---

## 文件边界与任务依赖

| 文件 | 职责 | 任务 |
| --- | --- | --- |
| `apps/api/src/permissions/policy.ts` | 六个角色、权限目录、依赖、默认值和覆盖校验 | 1 |
| `apps/api/src/permissions/scope.ts` | 当前公司及本人查询谓词、记录可访问性 | 4 |
| `apps/api/src/permissions/redact.ts` | 公开 DTO 非原地字段投影 | 5 |
| `apps/api/src/permissions/live-context.ts` | 写事务内重新验证会话、启用状态和成员权限 | 3 |
| `apps/api/src/erp/users.service.ts` | 从 CatalogService 提取用户生命周期；权限管理读写与版本 | 3 |
| `apps/api/src/erp/ownership.service.ts` | 负责人候选及单条/批量分配 | 4 |
| `apps/api/src/erp/permissions.controller.ts` | 新增目录、个人覆盖、负责人接口 | 3、4 |
| `apps/api/prisma/schema.prisma` | 六角色、成员覆盖、负责人关联与索引 | 2 |
| `apps/api/prisma/migrations/20261012_user_permissions/migration.sql` | 经核对的手写迁移 SQL；不把旧库当作已建立 Prisma migrate 基线 | 2 |
| `scripts/migrate-user-permissions.mjs` | 预检、备份核验、事务执行迁移 | 2、12 |
| `apps/api/src/auth/auth.service.ts`、`common/context.ts`、`common/input.ts` | 当前有效权限、逐项 permit、删除旧角色与默认值 | 1—3 |
| `apps/api/src/erp/catalog.service.ts` | 资料、bootstrap、查询/导出与报表范围 | 5、7 |
| `apps/api/src/erp/documents.service.ts`、`bank.service.ts`、`erp.controller.ts` | 单据、库存、财务各动作授权与安全返回 | 6、7 |
| `apps/api/src/erp/erp.module.ts` | 注册新增服务与控制器 | 3、4 |
| `apps/web/src/lib/permissions.ts` | 只读取有效权限的 UI 助手；不定义角色默认规则 | 8 |
| `apps/web/src/components/user-permissions.tsx` | 角色默认/个人覆盖/最终权限编辑器 | 8 |
| `apps/web/src/components/owner-picker.tsx` | 负责人及历史未分配资料分配入口 | 8 |
| `apps/web/src/lib/api.ts`、`lib/client.ts`、`lib/forms.ts` | 安全 DTO 类型及字段元数据 | 8、9 |
| `apps/web/src/components/{shell,workspace,master-form,document-editor,document-view,product-match}.tsx` | 逐项业务 UI、负责人、隐藏/只读字段 | 8、9 |
| `apps/web/src/app/(erp)/{page.tsx,modules/[slug]/page.tsx,documents/new/page.tsx,documents/[id]/page.tsx,documents/[id]/edit/page.tsx,documents/[id]/print/page.tsx,posts/[id]/page.tsx}` | 服务端路由、授权错误、打印与统计 | 9 |
| `apps/web/src/lib/translations/en.json` | 新增文案英文翻译 | 8、9 |
| `apps/api/test/{permissions,scope,redact}.test.mjs` | 权限解析、范围、字段投影的行为单元测试 | 1、4、5 |
| `scripts/{permission-fixtures,test-permissions,test-ownership,test-permission-fields,test-permission-actions,test-permission-reports,test-permission-browser}.mjs` | 隔离数据库及浏览器回归，各文件覆盖一种边界 | 3—11 |
| 现有 `scripts/test-business.mjs`、`test-user-lifecycle.mjs`、`test-language.mjs`、`test-browser.mjs`、`test-quote-sequence.mjs`、`test-parity.mjs` | 删除 VIEWER 测试身份，保留原测试意图并接入新回归 | 10、11 |
| `README.md`、`docs/dolibarr-parity.md` | 最终操作说明、迁移记录和真实验证证据 | 12 |

顺序：准备完整隔离副本 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12。后端有授权缺口或字段泄漏时不得先上线前端。

## 实施接口约定

权限 key 和默认值详见 spec 第 3—4 节。所有未注册 key 拒绝。如下接口名称在后续任务中保持一致：

```ts
// policy.ts
export const ROLE_NAMES = ['ADMIN', 'MANAGER', 'SALES', 'PURCHASING', 'WAREHOUSE', 'FINANCE'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
export type Scope = 'OWN' | 'ALL';
export type ScopeKey = 'customers' | 'suppliers' | 'QUOTE' | 'SALE' | 'PURCHASE' | 'INVOICE' | 'BILL';
export interface EffectiveAccess {
  permissions: Record<string, boolean>;
  scopes: Record<ScopeKey, Scope>;
  version: number;
}
export interface Overrides {
  permissions: Record<string, boolean>;
  scopes: Partial<Record<ScopeKey, Scope>>;
}
export function resolveAccess(role: RoleName, overrides: Overrides, version = 1): EffectiveAccess;
export function parseAccessPatch(raw: unknown, previous: Overrides): Overrides;
export function permissionCatalog(): {
  roles: { role: RoleName; access: EffectiveAccess }[];
  permissions: { key: string; label: string; group: string; dependsOn: string[]; adminOnly: boolean }[];
  scopes: { key: ScopeKey; label: string }[];
};
// common/context.ts：Context 保留原字段，增加 access: EffectiveAccess。
export function permit(c: Context, key: string): void; // false/未知 key → 403
// scope.ts
export function documentWhere(c: Context, kind?: DocumentKind): Prisma.DocumentWhereInput;
export function partnerWhere(c: Context, type?: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'): Prisma.PartnerWhereInput;
// live-context.ts
export function refreshContext(tx: Prisma.TransactionClient, c: Context): Promise<Context>;
// redact.ts；类型参数分别是 Prisma include 所得完整对象，返回安全 DTO 类型。
export function projectProduct(c: Context, row: ProductRecord): ProductDTO;
export function projectPartner(c: Context, row: PartnerRecord): PartnerDTO;
export function projectDocument(c: Context, row: DocumentRecord): DocumentDTO;
// web/lib/permissions.ts
export function can(access: EffectiveAccess, key: string): boolean;
export function documentKey(kind: string, action: string): string;
```

`ProductRecord/PartnerRecord/DocumentRecord` 在 redact.ts 用 `Prisma.*GetPayload` 定义：产品含 components.product，单据含 lines.product、partner、source、children；每个关联可以是 undefined。DTO 用 `Omit` 加可选字段定义，禁止为了通过类型检查使用 `any` 或把隐藏价格补成零。DocumentDTO 中成本、内部备注、采购金额可缺省，前端必须处理缺省。

### Task 0: 从当前工作目录建立完整隔离副本和基线

**Files:** 不修改业务源码。产物放在 `/tmp/nicerp-permissions` 和 `/tmp/nicerp-permissions-evidence`，隔离副本有自己的 Git 基线。

**Interfaces:** 消费当前含多语言改动的工作目录；产出独立代码、独立构建目录及测试日志。

- [ ] **Step 1：记录当前状态并复制完整工作目录。** 先读 `git status --short`，确认目的目录不存在；以下 rsync 必须保留 node_modules 中依赖自己的 dist 目录。

```bash
git status --short
mkdir -p /tmp/nicerp-permissions-evidence
git diff --binary > /tmp/nicerp-permissions-evidence/before.patch
test ! -e /tmp/nicerp-permissions
rsync -a --exclude='/.git/' --exclude='/apps/web/.next/' --exclude='/apps/api/dist/' --exclude='/artifacts/' /var/www/html/NicErp/ /tmp/nicerp-permissions/
git -C /tmp/nicerp-permissions init
git -C /tmp/nicerp-permissions add .
git -C /tmp/nicerp-permissions commit -m "Baseline current NicErp source for permission work"
```

这次基线提交只发生在 /tmp 副本，用于保留当前完整源码（包括多语言），不提交或改写原仓库的既有改动。后续任务提交均在该副本完成，上线按文件清单带回原项目。

- [ ] **Step 2：在副本生成客户端并跑原基线。** 后续 Run 均在 `/tmp/nicerp-permissions` 执行，除非明确指定生产路径。

```bash
npm run db:generate
npm test
npm run build -w @nicerp/web
BROWSER_TEST=1 npm run test:business
```

预期：原 25 个业务场景及已有对齐/浏览器场景通过。测试 harness 硬编码将 DATABASE_URL 路径替换为 nicerp_test，不输出连接密码。

- [ ] **Step 3：保存基线证据。** 各命令重定向到 evidence 文件并检查真实退出码；不得将已有 language 日志作为本次新功能测试证据。确认 root 的 `.next` 和生产数据未用于测试。

### Task 1: 建立权限注册表、六角色模板与覆盖规则

**Files:** Create `apps/api/src/permissions/policy.ts`; Test `apps/api/test/permissions.test.mjs`。暂不修改运行中的 permit，避免部分动作失去授权。

**Interfaces:** 产出上面的 RoleName/EffectiveAccess/Overrides、resolveAccess、parseAccessPatch、permissionCatalog；由 Tasks 3—9 消费。

- [ ] **Step 1：写失败测试。** 首批测试内容如下；再用表驱动测试逐一断言 spec 角色表中的允许/禁止及所有 adminOnly 项。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_NAMES, resolveAccess, parseAccessPatch } from '../dist/permissions/policy.js';
const empty = { permissions: {}, scopes: {} };
test('six roles and personal false overrides inherited true', () => {
  assert.deepEqual(ROLE_NAMES, ['ADMIN', 'MANAGER', 'SALES', 'PURCHASING', 'WAREHOUSE', 'FINANCE']);
  const a = resolveAccess('SALES', {
    permissions: { 'products.update': false }, scopes: { QUOTE: 'ALL' },
  }, 3);
  assert.equal(a.permissions['products.update'], false);
  assert.equal(a.permissions['documents.QUOTE.create'], true);
  assert.equal(a.permissions['fields.cost.read'], false);
  assert.equal(a.scopes.QUOTE, 'ALL');
  assert.equal(a.scopes.customers, 'OWN');
  assert.equal(a.version, 3);
});
test('inherit removes only the requested override', () => {
  const a = parseAccessPatch({
    permissions: { 'products.update': null }, scopes: { QUOTE: null },
  }, { permissions: { 'products.update': false }, scopes: { QUOTE: 'ALL' } });
  assert.deepEqual(a, empty);
});
test('bad keys, values, administrator overrides and conflicting dependencies fail closed', () => {
  assert.throws(() => parseAccessPatch({ permissions: { 'unknown.key': true } }, empty));
  assert.throws(() => parseAccessPatch({ permissions: { 'products.update': 'false' } }, empty));
  assert.throws(() => parseAccessPatch({ scopes: { QUOTE: 'TEAM' } }, empty));
  assert.throws(() => resolveAccess('ADMIN', { permissions: { 'products.read': false }, scopes: {} }));
  assert.throws(() => resolveAccess('MANAGER', {
    permissions: { 'fields.cost.read': false }, scopes: {},
  }));
});
```

- [ ] **Step 2：运行红灯。** `npm run test -w @nicerp/api`；预期新测试因为 policy 模块不存在失败，原测试仍能通过。
- [ ] **Step 3：实现完整注册表和解析器。** 普通 key 使用 spec 中的逐项目录；文档 key 按实际支持的 kind/action 生成。依赖先做最终值合并再检查，不能在每次合并时把管理员表覆盖到其他角色。关键逻辑：

```ts
export function resolveAccess(role: RoleName, overrides: Overrides, version = 1): EffectiveAccess {
  const defaults = defaultAccess(role); // 本文件内部函数，按 spec 的精确矩阵生成。
  if (role === 'ADMIN' && (Object.keys(overrides.permissions).length || Object.keys(overrides.scopes).length))
    throw new BadRequestException('管理员不能设置个人权限覆盖');
  const permissions = { ...defaults.permissions, ...overrides.permissions };
  const scopes = { ...defaults.scopes, ...overrides.scopes };
  for (const item of DEFINITIONS) {
    if (!permissions[item.key]) continue;
    if (item.adminOnly && role !== 'ADMIN') throw new BadRequestException('此权限仅限管理员');
    const missing = item.dependsOn.filter((key) => !permissions[key]);
    if (missing.length) throw new BadRequestException(`权限 ${item.key} 缺少依赖：${missing.join('、')}`);
  }
  return { permissions, scopes, version };
}
```

`defaultAccess` 生成所有注册 key 的布尔值，不遗漏 false。`DEFINITIONS` 是完整目录及依赖；不注册未实现的产品删除、团队或跨公司动作。默认模板自身也须通过同样依赖校验。parseAccessPatch 接受且只接受 permissions/scopes 两个容器，分别校验 plain object、已注册 key、bool/null 与 OWN/ALL/null；拒绝 `__proto__`、constructor、prototype。API 外层负责 version，不传入此解析器。

- [ ] **Step 4：绿灯。** `npm run test -w @nicerp/api`；新增断言还包含普通角色不能授予 users.managePermissions、所有字段 edit 依赖 read、WAREHOUSE 可收货却不能改单、未知权限查阅不为 true。
- [ ] **Step 5：检查任务 diff 并单独提交。** 提交名 `feat: define per-company permission policies`。当前暂存区有其他文件时只使用明确路径，不提交已存在的多语言改动。

### Task 2: 增加存储字段和负责人，删除 VIEWER 枚举及默认值

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/src/common/input.ts`, `apps/api/src/erp/catalog.service.ts` 的新成员 role 读取; Create `apps/api/prisma/migrations/20261012_user_permissions/migration.sql`, `scripts/migrate-user-permissions.mjs`; Test `scripts/test-permission-migration.mjs`。

**Interfaces:** 产出 Membership 覆盖/版本、Document/Partner.ownerUserId，以及只有六值的 Prisma Role。

- [ ] **Step 1：在隔离测试库保存旧结构测试夹具。** 两个测试分支：没有 VIEWER 成员则迁移；有 VIEWER 成员则迁移失败且零 DDL。保存旧记录 id、金额、数量、active、locale 和密码哈希的数据库内比较结果，不把哈希输出到日志。测试夹具是专门迁移测试，不能混用全业务回归中的新 schema。

```js
const before = await client.query('SELECT COUNT(*)::int AS n FROM documents');
await client.query(sql);
assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM documents')).rows[0].n, before.rows[0].n);
assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM documents WHERE "ownerUserId" IS NOT NULL')).rows[0].n, 0);
assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM memberships WHERE "permissionsVersion" <> 1')).rows[0].n, 0);
```

测试文件完整定义 client：`pg.Client`，使用 DATABASE_URL 并强制 pathname=`/nicerp_test`；定义 sql 为 readFileSync 对应 migration.sql 的内容；断言数据库名之后才允许重建旧测试结构。另一个分支 BEGIN 后插入 VIEWER 成员并执行 sql，捕获 `legacy VIEWER memberships exist`，ROLLBACK 后确认 Role 仍含 VIEWER、ownerUserId 列未出现。

- [ ] **Step 2：运行红灯。** `node --env-file=apps/api/.env scripts/test-permission-migration.mjs`；预期 SQL 文件/新增字段尚不存在而失败。
- [ ] **Step 3：修改 schema，并编写事务 SQL。** User 增加命名反向关联 ownedDocuments、ownedPartners；Document 与 Partner 的 owner 关系 `onDelete: SetNull`。Membership.role 不再有 @default。迁移 SQL 核心内容必须完整匹配 Prisma 生成的差异：

```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM memberships WHERE role::text = 'VIEWER') THEN
    RAISE EXCEPTION 'legacy VIEWER memberships exist';
  END IF;
END $$;
ALTER TABLE memberships ALTER COLUMN role DROP DEFAULT;
CREATE TYPE "Role_permissions_new" AS ENUM ('ADMIN','MANAGER','SALES','PURCHASING','WAREHOUSE','FINANCE');
ALTER TABLE memberships ALTER COLUMN role TYPE "Role_permissions_new" USING role::text::"Role_permissions_new";
DROP TYPE "Role";
ALTER TYPE "Role_permissions_new" RENAME TO "Role";
ALTER TABLE memberships ADD COLUMN "permissionOverrides" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "scopeOverrides" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "permissionsVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN "ownerUserId" UUID;
ALTER TABLE partners ADD COLUMN "ownerUserId" UUID;
ALTER TABLE documents ADD CONSTRAINT "documents_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE partners ADD CONSTRAINT "partners_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "documents_companyId_ownerUserId_kind_date_idx" ON documents("companyId","ownerUserId",kind,date);
CREATE INDEX "partners_companyId_ownerUserId_type_idx" ON partners("companyId","ownerUserId",type);
```

迁移工具使用已有 pg：默认只做预检，`--apply` 才读取备份清单并 BEGIN、LOCK memberships/users/documents/partners、再次检查 VIEWER、执行 SQL、核对行数与历史 owner 全 NULL 后 COMMIT。SQL 本身不写 BEGIN/COMMIT，交由工具管理。发现已安装字段则报告已迁移，不能重复运行 DDL。生产执行必须同时提供 `--business-database=nicerp --backup=<备份目录>`；校验真实数据库名和备份文件存在，不输出连接串。不要使用生产 `db push --accept-data-loss`。

- [ ] **Step 4：验证迁移与客户端。** 运行迁移测试及 `npm run db:generate`、`npm run typecheck -w @nicerp/api`。移除 input.roles 的 VIEWER，并把 CatalogService 新成员 `choice(b, 'role', roles, 'VIEWER')` 改为 `choice(b, 'role', roles)`；新成员缺少 role 返回 400。数据库旧业务值、locale、账号状态不变，owner 全 NULL，schema diff 为空。
- [ ] **Step 5：单独提交。** `feat: store member access overrides and record ownership`。迁移脚本此时只在隔离库执行。

### Task 3: 统一成员管理、有效会话权限和配置 API

**Files:** Create `apps/api/src/erp/users.service.ts`, `apps/api/src/erp/permissions.controller.ts`, `apps/api/src/permissions/live-context.ts`, `scripts/permission-fixtures.mjs`, `scripts/test-permissions.mjs`; Modify auth.service.ts, common/context.ts, catalog.service.ts, erp.module.ts, scripts/test-business.mjs。

**Interfaces:** UsersService 的 `create(c,raw)`、`update(c,userId,raw)`、`remove(c,userId)` 替代 CatalogService 用户分支；`getPermissions(c,userId)` 和 `patchPermissions(c,userId,raw)` 提供 spec API。CatalogService 委托旧用户路由，保持状态码和返回结构。Context.access 用 Task 1 类型。

- [ ] **Step 1：增加 API 失败场景与可复用夹具。** `createPermissionFixture({call,companyId})` 创建 alice/bob SALES 成员、各自登录和客户、QUOTE；创建 quote 时 productId 使用管理员创建的产品，quantity='2'、unitPrice='20'、taxRate='0'，date='2026-10-12'。返回 `{alice,bob,aliceToken,bobToken,alicePartner,bobPartner,aliceQuote,bobQuote,product,companyId}`。密码用 `Permission-` + randomUUID，邮箱分别为 alice-permission@nicerp.test、bob-permission@nicerp.test。导出的 API 测试如下：

```js
export async function runPermissions({ call, companyId, companyB, pass }) {
  const fx = await createPermissionFixture({ call, companyId });
  const url = `erp/users/${fx.alice.id}/permissions`;
  const before = await call(url);
  await call(url, 'PATCH', {
    version: before.version, permissions: { 'products.update': false }, scopes: {},
  });
  const me = await call('auth/me', 'GET', undefined, { token: fx.aliceToken });
  assert.equal(me.access.permissions['products.update'], false);
  await call(url, 'PATCH', {
    version: before.version, permissions: {}, scopes: {},
  }, { status: 409 });
  await call(url, 'GET', undefined, { token: fx.aliceToken, status: 403 });
  await call(url, 'GET', undefined, { companyId: companyB.id, status: 404 });
  await call('erp/users', 'POST', { name: 'Removed', email: 'removed-role@nicerp.test',
    password: 'Removed-role-password', role: 'VIEWER' }, { status: 400 });
  pass('personal access versions, live sessions, company boundary and removed role');
  return fx;
}
```

permission-fixtures.mjs 导出完整夹具创建函数；test-permissions.mjs import assert、该函数，其他脚本消费这份 fx 而不再次创建同邮箱。把 runPermissions 放在原有业务场景之后、browser 之前运行。

- [ ] **Step 2：验证红灯。** `npm run build -w @nicerp/api` 后运行业务测试；预期新增 GET permissions 返回 404。此阶段旧 VIEWER 夹具先按 Task 10 中的限定身份方案改到 SALES，使红灯落在当前新增行为。
- [ ] **Step 3：实现身份及授权接口。** authenticate 当前查询的 memberships 已带完整记录，可直接解析 JSON 覆盖，计算 Context.access；me 返回 access；bootstrap 后续 Task 5 返回同一 access。新增逐项 permit，未知/false 403。为了让尚未接入的业务在中间任务仍可测试，把旧 area 判定明确命名为 legacyPermit，并仅在未迁移服务里以 `legacyPermit as permit` 导入；Tasks 5—7 逐个替换，Task 11 必须证明 legacyPermit 已彻底移除，任何中间版本都不部署。把旧 users 分支和 removeUser 完整移到 UsersService，保留 active、跨公司管理员、密码和最后启用管理员保护；role 改动递增 permissionsVersion。新增控制器在 ErpModule 注册，以下 PATCH 在同一 Serializable 事务内比较版本、验证依赖、更新和审计：

```ts
return atomic(this.db, async (tx) => {
  const live = await refreshContext(tx, c);
  permit(live, 'users.managePermissions');
  const member = await tx.membership.findUnique({
    where: { userId_companyId: { userId, companyId: live.companyId } },
  });
  if (!member) throw new NotFoundException('记录不存在或不属于当前公司');
  if (member.permissionsVersion !== b.version) throw new ConflictException('权限已被修改，请刷新后重试');
  const next = parseAccessPatch({ permissions: b.permissions, scopes: b.scopes }, readOverrides(member));
  resolveAccess(member.role, next, member.permissionsVersion + 1);
  const updated = await tx.membership.update({
    where: { userId_companyId: { userId, companyId: live.companyId } },
    data: { permissionOverrides: next.permissions, scopeOverrides: next.scopes,
      permissionsVersion: { increment: 1 } },
  });
  await audit(tx, live, 'PERMISSIONS', 'users', userId, JSON.stringify({
    before: readOverrides(member), after: next,
  }));
  return permissionsDTO(updated);
});
```

本文件内部定义 readOverrides（校验 JSON，不把损坏覆盖当全部允许）和 permissionsDTO（返回 role/overrides/effective/version，不返回 user.passwordHash）。请求 b 只允许 version/permissions/scopes，version 必须正整数且必填。refreshContext 使用 c.sessionId 查询实际 session、到期时间、active 和当前公司 membership，返回新 Context；用户停用或会话失效返回 401，成员移除返回 401。临时 legacyPermit 不能用于 UsersService；用户分支已全部使用新 key。

- [ ] **Step 4：验证绿灯与旧生命周期。** API 用同一登录 token 连续调整权限，下一次请求即变化；异公司不可访问；自授管理员、提交越界字段、伪造 userId、过期版本均失败且不写入。角色/账号启停原并发用例不删除；同时更新版本的两个 PATCH 只有一个成功。
- [ ] **Step 5：单独提交。** `feat: manage company member permissions with live authorization`。

### Task 4: 负责人范围、历史资料与分配接口

**Files:** Create scope.ts, ownership.service.ts, apps/api/test/scope.test.mjs, scripts/test-ownership.mjs; Modify permissions.controller.ts, erp.module.ts, users.service.ts。消费 Task 3 的 fx 与 refreshContext。

**Interfaces:** documentWhere/partnerWhere 与 OwnershipService.candidates(c)、assign(c,raw)。未来业务查询直接使用这些谓词，不在调用点重新写一套角色逻辑。

- [ ] **Step 1：写失败单元/API 测试。** 默认 SALES 只能看到自己的客户和 QUOTE；NULL 和其他用户不匹配；ALL 仍含 companyId，混合 kind 每个 kind 分别应用其 scope。API 示例：

```js
export async function runOwnership({ call, db, fx, pass }) {
  await db.document.update({ where: { id: fx.bobQuote.id }, data: { ownerUserId: null } });
  await call(`erp/documents/${fx.bobQuote.id}`, 'GET', undefined,
    { token: fx.aliceToken, status: 404 });
  const before = await call(`erp/documents/${fx.bobQuote.id}`);
  await call('erp/ownership/assign', 'POST', { resource: 'documents',
    ids: [before.id], ownerUserId: fx.alice.id, versions: { [before.id]: before.version } });
  const assigned = await call(`erp/documents/${before.id}`, 'GET', undefined,
    { token: fx.aliceToken });
  assert.equal(assigned.ownerUserId, fx.alice.id);
  await call('erp/ownership/assign', 'POST', { resource: 'documents',
    ids: [before.id], ownerUserId: fx.bob.id, versions: { [before.id]: before.version } },
    { status: 409 });
  pass('unassigned history, assignment and ownership optimistic locking');
}
```

此段在 Task 6 的详情范围接入前仍红灯；Task 4 在 nicerp_test 中用 db 给夹具设置两位负责人的 ownerUserId，直接断言 predicate 的数据库查询结果和 assign 的版本/归属；Task 5—6 接入 create 默认负责人之后，移除这段手动设置并断言 API 自动归属，Task 6 执行完整详情断言。

- [ ] **Step 2：红灯。** `npm run test -w @nicerp/api`，预期 scope 模块不存在；单独检查 ownership 新路由 404。
- [ ] **Step 3：实现谓词与分配。** documentWhere 对 kind 未指定时生成 OR 分支，每一分支必须有对应 read；没有任何可读 kind 时 403。关键构造：

```ts
const branches = readableKinds.map((kind) => ({
  kind,
  ...(c.access.scopes[kind] === 'OWN' ? { ownerUserId: c.userId } : {}),
}));
return { companyId: c.companyId, OR: branches };
```

partnerWhere 同样按 CUSTOMER/SUPPLIER/BOTH 分支构造，先用 can 判断各类型 read；不能把搜索 OR 与范围 OR 相互覆盖，应使用 AND 包装。assign 限制 1—100 个不同 UUID；验证 ownerUserId 是当前公司启用成员，null 为取消分配。文档逐个查询、检查实际 kind 的 read/assign/ALL 及版本；往来单位按实际 type 检查。事务内全部 update + audit，任何无权 id 均 404、没有动作权限 403、版本冲突 409；不能先更新合法行再报告非法行。移除成员时 current company 的资料 owner 设为 null，文档版本递增。

- [ ] **Step 4：绿灯。** 谓词单元测试和数据库查询绿灯；分配路由测试覆盖跨公司目标、停用目标、批量重复 id、BOTH 类型、版本、整批回滚和只拥有 OWN 的 assign 请求 403。Task 6 完成后再核对个人详情可见性。
- [ ] **Step 5：单独提交。** `feat: enforce company record ownership and assignment`。

### Task 5: 资料查询、bootstrap、字段投影与导出

**Files:** Create redact.ts, apps/api/test/redact.test.mjs, scripts/test-permission-fields.mjs; Modify catalog.service.ts, erp.controller.ts。产品/往来单位 CRUD 保持现有业务校验和匹配算法。

**Interfaces:** projectProduct/projectPartner/projectDocument 安全 DTO；CatalogService.read 增加 query.intent='read'|'export'，export 在任何数据查询前校验对象 export。bootstrap 总是可调用，但只返回授权且过滤后的数组与 access。

- [ ] **Step 1：失败测试覆盖真正的数据泄漏。** 投影不改变原对象，无成本权限时顶层、组合组件和所有嵌套 product 均无 costPrice。没有客户权限的 bootstrap partners=[]；OWN 客户列表/联系人/报价供货筛选只有自己的，rows 与 total 一致。

```js
test('product DTO removes nested cost without altering internal values', () => {
  const raw = { id: 'p1', costPrice: '8.50', components: [
    { product: { id: 'p2', costPrice: '3.25', salePrice: '10' } },
  ] };
  const ctx = { access: resolveAccess('SALES', { permissions: {}, scopes: {} }) };
  const safe = projectProduct(ctx, raw);
  assert.equal(Object.hasOwn(safe, 'costPrice'), false);
  assert.equal(Object.hasOwn(safe.components[0].product, 'costPrice'), false);
  assert.equal(raw.components[0].product.costPrice, '3.25');
});
```

单元 test ctx 在 JS 中无需构造无关字段；projectProduct 只消费 access。测试文件 import test/assert、policy 和 redact 的 dist 模块。

- [ ] **Step 2：红灯。** `npm run test -w @nicerp/api`；运行 test-permission-fields 的 API assertions 前接入业务 harness，预期旧 JSON 仍包含 costPrice。
- [ ] **Step 3：实现正向 DTO 和资料边界。** 不使用通用 delete 所有名为 unitPrice 的字段：销售单价不是采购价格。每种 DTO 明确区分资源/kind。纯函数示例：

```ts
const { costPrice, components, ...rest } = row;
return {
  ...rest,
  ...(c.access.permissions['fields.cost.read'] ? { costPrice } : {}),
  ...(components ? { components: components.map((part) => ({
    ...part, ...(part.product ? { product: projectProduct(c, part.product) } : {}),
  })) } : {}),
};
```

对应安全结构不应把 rest 中的其他嵌套 product/供应商价格原样带出。Catalog.read 的产品及匹配响应调用 projectProduct；partners/contacts/supplier-prices 先应用 partnerWhere，再安全投影关联对象。supplierPrices 读取与维护还需要采购价格查看/修改。lookups/warehouses/accounts/posts/audit 分别使用目录动作，不沿用 area 写权限。bootstrap 按各资源 read 选空数组或受限查询，组合组件成本使用同一投影。GET intent=export 只接受 read/export，否则 400；客户/供应商混合导出必须分别具有可返回类型的 export。

- [ ] **Step 4：保护资料写入。** 产品 create/update 对 costPrice 的出现检查 fields.cost.edit；缺省时旧值不变，新建服务器默认 0。未授权 ownerUserId 或权限字段 403。联系人和供应商价目提交 partnerId 时先用 partnerWhere 查授权的当前公司资料，不仅验证公司。create Partner 默认 ownerUserId=c.userId，update 省略 owner 保留旧值。所有 mutation 的结果都调用相同 DTO 投影。

- [ ] **Step 5：绿灯。** 单元、目录与 bootstrap API 测试通过；成本禁止时直接 PUT/PATCH 偷渡 0 或真实成本均 403，允许编辑普通名称且旧成本保持；OWN 搜索其他客户名不能通过 total 泄漏，供货匹配仍按原算法。
- [ ] **Step 6：单独提交。** `feat: filter catalog access and redact sensitive data`。

### Task 6: 单据动作、个人范围与价格/备注保护

**Files:** Modify documents.service.ts, erp.controller.ts; Create scripts/test-permission-actions.mjs; Extend test-permission-fields.mjs。消费 documentWhere、projectDocument、refreshContext。

**Interfaces:** `DocumentsService.detail(c,id,intent='read')` 只返回公开 DTO；新增 private `loadDocument(tx,c,id)` 返回未脱敏内部完整记录、应用 documentWhere。read 的 query.intent 支持 read/export；打印路由调用详情 `?intent=print`。

- [ ] **Step 1：写失败场景。** 用 fx.aliceToken 访问 bobQuote 的详情、更新、确认、克隆、CSV importLines 的 docId，分别应 404；取消 confirm 权限后同一 token 的 confirm 403，但允许 update 保留。字段断言：

```js
const dto = await call(`erp/documents/${fx.aliceQuote.id}`, 'GET', undefined,
  { token: fx.aliceToken });
assert.equal(Object.hasOwn(dto.lines[0], 'unitCost'), false);
const version = dto.version;
await call(`erp/documents/${dto.id}`, 'PATCH', { ...dto,
  version, privateNotes: 'forged hidden note' }, { token: restrictedToken, status: 403 });
```

restrictedToken 在同一测试中由管理员修改 alice 的 privateNotes.read/edit 为 false 后取 aliceToken；更新 body 只含现有业务字段，删除 DTO 元信息/access/ownerUserId，不能把 spread 的读 DTO 直接作为最终合法表单。测试还要使用管理员读取 oldNote 后省略 privateNotes 更新其他字段，断言 oldNote 保留。

- [ ] **Step 2：红灯。** 接入 runPermissionActions({call,db,fx,pass}) 和 runPermissionFields({call,db,fx,pass}) 后跑 `npm run test:business`；预期其他用户详情仍返回 200 或 unitCost 泄漏。
- [ ] **Step 3：把 read/detail/source/children 改为授权内部加载再 DTO。** 统一 documentWhere 后 AND 搜索、status、id；非法 kind 400、不可读 kind 403、不可访问记录 404。加载 source/children 安全摘要时再按各自 read/scope 判断，不能因为可读上游就暴露下游。所有 create/update/clone/transition/convert 返回投影；错误不得回显隐藏金额或客户完整资料。
- [ ] **Step 4：替换各动作 permit。** 每个事务先 refreshContext。save 分别需要 kind.create/update；clone 需要 clone+create；transition 对 confirm/void/reopen/delete/accept/reject 各自授权；convert 需要 source.convert 与 target.create。来源、目标 partner 以及 previous-existing 返回均校验范围。create/clone/convert owner 默认执行人，旧 owner=null 的普通操作不能占为己有。核心调用形态：

```ts
return atomic(this.db, async (tx) => {
  const live = await refreshContext(tx, c);
  const doc = await this.loadDocument(tx, live, docId);
  permit(live, `documents.${doc.kind}.confirm`);
  const result = await tx.document.update({
    where: { id: doc.id }, data: { status: 'CONFIRMED', version: { increment: 1 } },
  });
  await audit(tx, live, 'CONFIRM', 'documents', doc.id, doc.number);
  return projectDocument(live, { ...doc, ...result });
});
```

此片段保留原方法所有状态、下游、履约、付款检查后才 update。旧 `clone` 不能调用已经脱敏的 detail 再 save；通过私有完整 loader 生成内部复制输入，系统携带的成本/备注不伪装成用户可编辑输入。

- [ ] **Step 5：接入输入字段与预览接口保护。** importLines/transformLines/purchasePrice body 支持可选 docId：存在时需要 update 与可访问单据，不存在时需要 create；还分别需要 importLines 或具体价格/操作权限。purchasePrice 与采购 CSV 结果必须满足采购价格查看；无权不可拿这些接口推算成本。取价或采购 CSV 预览若使用参考成本回退，另需 fields.cost.read；没有该权限时拒绝回退并返回不含金额的“没有可用报价”提示，不能仅把 costPrice 改名为 unitPrice。privateNotes 省略保留旧值，explicit 提交需要 edit；客户端 unitCost 禁止作为可变业务输入，服务器仍照常算快照。PURCHASE/BILL 编辑价格需要 read/edit；缺少这两项时不提供金额编辑入口，允许独立归属分配及数量履约。自由明细、报价序号、折扣税、版本、原 CSV 匹配规则保持原实现。

- [ ] **Step 6：绿灯。** API 覆盖所有现有动作、跨 kind 转换、不同负责人、NULL、价格/备注隐藏及版本冲突；报价序号与原 CSV 全部通过。重复 convert 的 existing 返回也经过 projectDocument，不能返回隐藏字段。
- [ ] **Step 7：单独提交。** `feat: authorize document actions and protect private fields`。

### Task 7: 库存、资金、工作台与毛利统计授权

**Files:** Modify documents.service.ts, bank.service.ts, catalog.service.ts; Create scripts/test-permission-reports.mjs; Extend test-permission-actions.mjs。

**Interfaces:** 继续使用 Context.access/documentWhere。工作台不再假定所有卡片一定有值，无权项目省略。金融及库存 mutation 的缓存返回必须通过实时校验。

- [ ] **Step 1：写失败测试。** WAREHOUSE token 能对可访问 SALE/PURCHASE 执行授权的收发货，但不能修改采购价格；finance.pay 未授予则 403。同一 actor 的幂等收货成功后撤销 receive，重放原 requestKey 必须 403。收付款/库存关联返回不能嵌套无权单据。毛利 API 无字段权限 403。

```js
const rights = await call(`erp/users/${warehouse.id}/permissions`);
await call(`erp/users/${warehouse.id}/permissions`, 'PATCH', {
  version: rights.version, permissions: { 'inventory.receive': false }, scopes: {},
});
await call(`erp/documents/${purchase.id}/fulfill`, 'POST', originalFulfillBody,
  { token: warehouseToken, status: 403 });
await call('erp/margins', 'GET', undefined, { token: fx.aliceToken, status: 403 });
const dash = await call('erp/dashboard', 'GET', undefined, { token: fx.aliceToken });
assert.equal(Object.hasOwn(dash, 'margin'), false);
```

warehouse、purchase、originalFulfillBody 在 runPermissionActions 中先通过管理员创建 WAREHOUSE 用户、默认己方 PURCHASE、确认和合法库存 requestKey 得到；不复用其他测试中可能已经退回/作废的单据。runPermissionReports({call,db,fx,pass}) 创建 alice/bob 各一张已确认 INVOICE，使用不同收入/成本数值，比较 OWN 和 ALL 聚合的明确总额。

- [ ] **Step 2：红灯。** `npm run test:business`；预期旧 role 判定或 early previous-return 绕过撤权检查。
- [ ] **Step 3：替换履约与资金动作。** 按单据 kind 与 FULFILL/RETURN 分别使用 ship/shipReturn/receive/receiveReturn；pay/reverse 对授权单据及账户检查，BILL 需可读采购金额。库存 adjust/transfer、银行 create/transfer/reconcile/reverse 各自独立授权。拿到 previous 幂等记录时先验证关联 doc/read/scope 和当前 action，再返回安全结果。

```ts
const live = await refreshContext(tx, c);
const doc = await tx.document.findFirst({ where: { AND: [documentWhere(live), { id: docId }] } });
if (!doc) throw new NotFoundException('记录不存在或不属于当前公司');
const actionKey = doc.kind === 'SALE'
  ? (action === 'RETURN' ? 'inventory.shipReturn' : 'inventory.ship')
  : (action === 'RETURN' ? 'inventory.receiveReturn' : 'inventory.receive');
permit(live, actionKey);
// previous 的查询与早返回只能放在上述授权之后。
```

- [ ] **Step 4：统计过滤与返回投影。** dashboard 的 document 查询使用 documentWhere，仅在相关 read 存在时计算卡片。完整审计仍仅 admin 可见，其他用户工作台不返回他人审计。margins SQL 根据 INVOICE scope 加参数化 owner 条件，禁止将用户输入拼成 SQL；先检查 margins.read、fields.margin.read、fields.cost.read、INVOICE.read，再 COUNT/GROUP/LIMIT。资金流水按关联发票/账单范围筛选；采购金额隐藏时排除/省略关联 BILL 价格信息。库存流水关联 doc 只投影可见摘要，仓库公共数量依据库存权限返回。

```ts
const ownerClause = c.access.scopes.INVOICE === 'OWN'
  ? Prisma.sql`AND d."ownerUserId" = ${c.userId}::uuid` : Prisma.empty;
```

在原 grouped SQL 的 WHERE 中插入 ownerClause，rows 与 count 共用同一 grouped 定义。无 authorized INVOICE 时 403，不构造空范围但查询全库。

- [ ] **Step 5：绿灯。** 比较 OWN/ALL 的报告金额和分页总数；撤销动作后旧幂等键也拒绝；原分批履约、退回、资金冲销、库存并发、组合库存及多币种仍通过。
- [ ] **Step 6：单独提交。** `feat: scope inventory finance and business reports`。

### Task 8: 用户权限编辑器和负责人分配界面

**Files:** Create web/lib/permissions.ts, components/user-permissions.tsx, components/owner-picker.tsx; Modify components/workspace.tsx, lib/forms.ts, lib/api.ts, lib/client.ts, translations/en.json, globals.css。

**Interfaces:** `UserPermissions({userId,onSaved})` 读取权限目录与用户授权；`OwnerPicker({resource,records,onAssigned})` 使用 GET owners 和 POST ownership/assign，records 为 `{id,version?,ownerUserId}` 数组。API DTO 在 Me/Bootstrap 增加 access。新增样式限定组件类名，不全局重排页面。

- [ ] **Step 1：写浏览器失败用例。** 在 runPermissionBrowser 的管理员登录上下文中，打开系统设置用户权限，选择 alice、打开“权限设置”、禁止产品修改、把 QUOTE 设 ALL 并保存；再重新读取 API 验证两个覆盖与版本。用 Alice 独立 browser context 验证设置不能自授。

```js
await page.goto(origin + '/modules/settings?tab=1');
await page.getByRole('row').filter({ hasText: 'Alice Permission' })
  .getByRole('button', { name: '权限设置', exact: true }).click();
await page.getByLabel('产品 / 修改 / 个人设置', { exact: true }).selectOption('deny');
await page.getByLabel('报价单 / 数据范围', { exact: true }).selectOption('ALL');
await page.getByRole('button', { name: '保存权限', exact: true }).click();
await expect(page.getByRole('status')).toContainText('权限已保存');
```

标签采用 `{目录组} / {权限动作} / 个人设置`，每个 select 有稳定 name=permission key；英语翻译不改变 key。fixture 的 name 在 Task 3 定为 Alice Permission/Bob Permission，避免用邮箱选择行。

- [ ] **Step 2：红灯。** 开启 BROWSER_TEST 的完整 harness，预期没有权限设置按钮或表单。
- [ ] **Step 3：实现表单与独立 UI 助手。** 前端 can 只读后端布尔值，不含 roles/grants。权限目录供表单分组，显示角色默认值和有效值；role 继续在现有用户编辑表单中选六个值，去掉 VIEWER，新增用户 role 初始为空并 required。核心保存 body：

```ts
await request(`erp/users/${userId}/permissions`, 'PATCH', {
  version: loaded.version,
  permissions: changedPermissionValues, // true / false / null
  scopes: changedScopeValues, // OWN / ALL / null
});
```

组件定义 loaded 为 getPermissions 的 DTO；changedPermissionValues/changedScopeValues 只保存与载入覆盖不同的 key，恢复继承发送 null。过期版本显示“权限已被修改，请刷新后重试”，保留未提交选择并提供重新加载；不自动重复写请求。依赖自动选项有 visited 集合防循环，同时展示被影响项，最终以后端验证为准。

- [ ] **Step 4：负责人显示和分配。** 报价/订单/发票与往来单位列表和详情显示负责人，null 显示未分配。只有相应 assign + ALL 显示分配按钮，支持选中最多 100 条；客户/供应商 BOTH 规则与后端一致。同一窗口批量分配对文档送每条 version，失败不显示部分成功。个人用户只能看到自身权限简要说明，权限编辑按钮不可见。用户设置 tab=4 与修改密码始终可打开。

- [ ] **Step 5：绿灯。** 类型检查及浏览器管理员编辑、恢复继承、中文/英文、冲突提示、分配与非管理员拒绝通过。新增标签、错误、空态、依赖说明全部加英文词条，业务姓名不翻译。
- [ ] **Step 6：单独提交。** `feat: add bilingual user permission and owner controls`。

### Task 9: 业务 UI、服务器路由、CSV 和打印使用有效权限

**Files:** Modify shell.tsx, workspace.tsx, master-form.tsx, document-editor.tsx, document-view.tsx, product-match.tsx, lib/client.ts, lib/forms.ts，以及文件边界表中明确列出的 App Router 页面；Extend test-permission-browser.mjs。

**Interfaces:** 所有前端 can(access,key) 消费后端 access。ProductDTO.costPrice、DocumentDTO.unitCost/privateNotes/采购金额字段可缺省；销售价格未被采购字段权限误删。

- [ ] **Step 1：写失败浏览器场景。** 同一个 SALES 用户禁止 QUOTE.confirm 但允许 update：编辑按钮可见、确认按钮不可见；成本列/表单/RSC 不出现真实值，仍能填写销售价格和保存。WAREHOUSE 采购详情显示数量不显示单价/合计且可以收货；打印和 CSV 导出不存在隐藏价格。直接 URL 与客户端点击都验证。

```js
await alicePage.goto(origin + `/documents/${fixture.permissionFixture.aliceQuote.id}`);
await expect(alicePage.getByRole('button', { name: '确认', exact: true })).toHaveCount(0);
await expect(alicePage.getByRole('link', { name: '编辑', exact: true })).toBeVisible();
await alicePage.goto(origin + '/modules/products');
await expect(alicePage.getByRole('columnheader', { name: '参考成本', exact: true })).toHaveCount(0);
await alicePage.goto(origin + '/modules/settings?tab=4');
await expect(alicePage.getByLabel('显示语言', { exact: true })).toBeVisible();
```

fixture.permissionFixture 在业务 harness 中加入 fx，browser receives 只需测试账号密码/IDs，不包括生产账号或密码。browser 的各 context 必须显式选择 fixture.companyId。

- [ ] **Step 2：红灯。** 新目录权限已配置但旧 can(role,area) 仍显示按钮、价格或隐藏个人设置，浏览器应该失败。
- [ ] **Step 3：替换菜单与逐个动作。** shell 按可读资源决定模块可见，settings 保留个人设置入口。workspace tabs 增加 read/action key，未授权 tab 不发 query；保留原 tab 编号而不是过滤后重新编号。document-view 分别判断 confirm/update/clone/delete/void/reopen/accept/reject/convert/fulfill/pay/print；转换的每个目标也要 target.create。master-form 根据 create/update、字段 edit/read 生成隐藏或只读字段，提交时不带未授权成本/备注/owner。既有用户编辑的角色/active 与权限覆盖组件分开，不串行两次写入同一个版本而假称原子更新。

```ts
export function can(access: EffectiveAccess, key: string) {
  return access.permissions[key] === true;
}
export function documentKey(kind: string, action: string) {
  return `documents.${kind}.${action}`;
}
const showCost = can(boot.access, 'fields.cost.read');
const columns = allColumns.filter(([key]) => key !== 'costPrice' || showCost);
```

- [ ] **Step 4：隐藏字段与路由保护。** 报表/工作台缺省金额卡片不渲染；采购详情与打印没 purchasePrice.read 时去掉价格、税、折扣、合计全部列/卡片，不用 0 替代。服务器 print 调用 `erp/documents/:id?intent=print`，403 显示“没有打印权限”，404 notFound，401 走已有登录清理；所有外部打印依旧不打印 privateNotes。权限检查数据放到 API，页面 layout 的 me 不作为唯一安全检查。API 后端 fetch 保持 cache=no-store。

- [ ] **Step 5：导入/导出。** workspace export 分页请求加 intent=export，导出 columns 与字段可见性一致；有 read 无 export 不显示系统导出入口。CSV 模板不含无权成本字段，导入无权成本字段时后端403，而不是忽略后覆盖零。document importLines 发送当前 docId 与 kind；新建时无 docId，已保存时需对应 update。中英文表头及序号功能保持；不新增单独报价导入页。

- [ ] **Step 6：绿灯。** `npm run typecheck`、`npm run test:i18n`、新浏览器场景通过。扫描业务组件中的 can 调用，不能残留 can(role,area) 或硬编码六角色判断来决定业务权利；角色标签显示与 admin 管理 UI 提示除外。
- [ ] **Step 7：单独提交。** `feat: apply granular permissions throughout business UI and output`。

### Task 10: 替换旧只读测试身份，保持原生命周期和语言回归

**Files:** Modify scripts/test-business.mjs, test-user-lifecycle.mjs, test-language.mjs, test-browser.mjs, test-quote-sequence.mjs, test-parity.mjs; Modify README 中旧角色说明（最终验证记录在 Task 12）。

**Interfaces:** 原 viewerToken/viewerEmail/viewerPassword 统一改为 restrictedToken/restrictedEmail/restrictedPassword，指向 SALES + 显式禁止需要验证的写动作，不再是角色。参数名称及所有调用点同步替换。

- [ ] **Step 1：保留行为测试并改用个人权限。** 语言测试仍断言无管理/写权限的人可以修改自己的语言；只读用户不能新增产品这一行为改为 products.create=false 的 SALES 用户。生命周期测试中的 role=VIEWER 降权改为 role=SALES + 对目标写动作的禁止，管理员降级测试直接用 SALES，不改变最后管理员断言。

```js
const access = await call(`erp/users/${restricted.id}/permissions`);
await call(`erp/users/${restricted.id}/permissions`, 'PATCH', {
  version: access.version, permissions: {
    'products.create': false, 'products.update': false,
    'documents.QUOTE.create': false, 'documents.QUOTE.update': false,
    'documents.QUOTE.importLines': false, 'documents.QUOTE.clone': false, 'products.import': false,
  }, scopes: {},
});
await call('erp/products', 'POST', { sku: 'DENIED', name: '禁止写入' },
  { token: restrictedToken, status: 403 });
await call('auth/preferences', 'PATCH', { locale: 'en' }, { token: restrictedToken });
```

禁止 QUOTE.create 时，所有依赖 create 的 clone 和新建导入也必须禁用；按 Task 1 目录依赖加入同组禁止，保证这些覆盖本身可通过校验。业务 tests 不用 fixture 角色名字断言只读能力。

- [ ] **Step 2：运行红灯，记录具体旧引用。** `rg -n 'VIEWER|viewerToken|viewerEmail|viewerPassword' apps scripts README.md docs`；预期初始发现 enum、角色标签和旧测试调用，逐项处理。只保留迁移 guard、非法 VIEWER 输入测试及历史说明中的 VIEWER 字样。
- [ ] **Step 3：调整隔离测试库准备顺序。** 当前 test-business 在 db push 后才 truncate；新 enum 可能被旧测试库 VIEWER 数据阻挡。先强制 DATABASE_URL pathname=nicerp_test，使用已有 pg 执行仅 test 库的 TRUNCATE users,companies CASCADE，再在相同环境运行 db push。若 Prisma 要求 accept-data-loss，旗标只能出现在已验证 nicerp_test 的 harness 内，不能加入全局 db:push。

```js
const database = new URL(process.env.DATABASE_URL);
database.pathname = '/nicerp_test';
process.env.DATABASE_URL = database.toString();
if (database.pathname !== '/nicerp_test') throw Error('Refusing non-test database');
const preflight = new Client({ connectionString: process.env.DATABASE_URL });
await preflight.connect();
try { await preflight.query('TRUNCATE TABLE users, companies CASCADE'); }
finally { await preflight.end(); }
const migrate = spawnSync('npm', ['run', 'db:push', '-w', '@nicerp/api', '--', '--accept-data-loss'],
  { env: process.env, stdio: 'inherit' });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
```

Client 从 pg import；脚本必须先存在旧/新 users 和 companies 表，首次空库通过检查 to_regclass 后跳过 truncate。migration-specific test 在自己的生命周期创建旧结构，跑完以后由此 harness 创建新结构，不并行访问同一个测试库。

- [ ] **Step 4：绿灯。** 原用户启停、多个会话、密码变化、旧 token、最后管理员并发、跨公司生命周期、序号、CSV、中文/英文完整用例继续通过；不因角色删除删掉对应场景。浏览器旧 VIEWER 下拉选择用 SALES 后权限设置调整。
- [ ] **Step 5：单独提交。** `test: replace retired viewer fixtures with personal access restrictions`。

### Task 11: 完整权限回归和构建验收

**Files:** Create scripts/test-permission-browser.mjs; Modify scripts/test-browser.mjs, scripts/test-business.mjs; 所有新回归文件保持直接 export 可由现有 harness 调用。

**Interfaces:** `runPermissionBrowser({browser,origin,fixture})`；fixture.permissionFixture 包含夹具账号/单据、与测试 API base 相匹配。只在已有 runBrowser 建立服务器和 browser 后调用，不再次占用 3100。

- [ ] **Step 1：补充跨入口测试，先观察失败。** 依次验证相同权限在列表、搜索、分页 count、bootstrap、详情、关联资料、导出、打印、RSC 响应、写入回包、取价、毛利/工作台和旧幂等回包中一致。采用成本固定标记值 9173.125 和内部备注 `SECRET-INTERNAL-PERMISSION`；先检查返回 JSON keys，再检查固定值，不能只靠固定值检索来证明安全。

```js
const response = await alicePage.request.get(origin + '/api/backend/erp/bootstrap');
const payload = await response.json();
assert.equal(payload.products.some((p) => Object.hasOwn(p, 'costPrice')), false);
await alicePage.goto(origin + `/documents/${fixture.permissionFixture.aliceQuote.id}`);
const html = await alicePage.content();
assert.equal(html.includes('SECRET-INTERNAL-PERMISSION'), false);
const [download] = await Promise.all([
  alicePage.waitForEvent('download', {
    predicate: (d) => d.suggestedFilename().endsWith('.csv'), timeout: 10000,
  }),
  alicePage.getByRole('button', { name: '导出 CSV', exact: true }).click(),
]);
```

保存并读取 download 的 CSV，断言无隐藏列名/值。RSC 检查 page.on('response') 捕获包含 text/x-component 的响应 body，不能只检查 visible DOM。打印检查 article.print-document 不含 internal marker；拥有内部备注权限的人打印也一样排除。

- [ ] **Step 2：修复失败，验证所有边界。** 每个场景开始时把上个场景修改的个人覆盖按已知 key 设为 null，并记录当前版本，不依赖测试执行顺序。覆盖同公司两位 SALES 不同个人配置、六角色默认值、跨公司 role 差异、NULL 历史记录、归属转移后的旧会话、先授权后撤销再重放幂等、个人不可自授、配置并发409、最后管理员并发。每个故障必须在对应服务/DTO边界修复，不靠 browser 注入或前端遮盖。
- [ ] **Step 3：一次完整验证。** 顺序执行、记录退出码；测试共享 nicerp_test，不并行跑 migration 与 business。必要时先运行迁移测试，随后 business 重置测试库。

```bash
npm run typecheck
npm test
node --env-file=apps/api/.env scripts/test-permission-migration.mjs
npm run build -w @nicerp/web
BROWSER_TEST=1 npm run test:business
```

预期新增权限测试、原 25 场景及三组对齐规则/浏览器全部通过；实际总数以执行日志为准，不提前写“全部通过”。一旦没有后续代码变更，不反复重跑同一整套测试。

- [ ] **Step 4：源码完整性检查和回归证据。** 确认 legacyPermit 已删除，且没有旧模块 permit(c,'sales') 等；schema、前端选项和权限目录只有六角色；先前撤销的独立报价导入路由仍不存在；英文新增文案没有词典缺项；测试目录无业务库连接硬编码。保存权限 API 负例、浏览器截图、构建/类型检查/单元/业务退出码。
- [ ] **Step 5：单独提交。** `test: verify granular authorization across API UI and reports`。

### Task 12: 文档、迁移备份、部署与在线验证

**Files:** Modify README.md, docs/dolibarr-parity.md; 使用 Task 2 的 migration SQL/runner。备份与验证产物放在 `/tmp/nicerp-permissions-release`，不将 .env、密码、会话令牌或数据库 dump 提交。

**Interfaces:** 从已绿灯隔离副本生成仅本任务文件清单与 SHA256；从业务库预检和备份；上线失败可恢复既有结构/源码。此任务只能在用户选择执行计划后进入，不由本轮文档编写触发。

- [ ] **Step 1：写最终文档和预检。** README 更新六角色、个人覆盖、本人范围、负责人迁移、字段及中英文入口；parity 只记录实际实现/验证项目，不把用户组、外部用户或跨公司共享勾成完成。读取真实 membership role 数量、未分配资料总数和 schema diff，VIEWER 非零则中止并向用户报告需要先分配现有角色。
- [ ] **Step 2：形成可恢复备份和审阅清单。** 备份本任务将修改的完整原文件、旧数据库 schema-only dump、users/memberships/documents/partners 及关联表的一致性备份，保存清单和权限600。审查 SQL 只有删除 VIEWER、成员三个字段、两个 owner 字段、外键和索引；确认数据不清空、locale/active 不改。示例 SQL 差异检查使用项目已安装 Prisma CLI help 中匹配 7.10 的参数，不复制其他版本的 flag。
- [ ] **Step 3：关闭 API 写入口后迁移并切换代码。** 网页可显示维护状态；停止旧 API，防止角色枚举迁移过程中旧代码创建 VIEWER。生成备份后仅执行已审核 migration runner，COMMIT 后生成匹配新 schema 的 Prisma client，再原子更新经过 SHA256 核验的文件并启动 API/Next。不直接在运行中 root 的 .next 做 npm build。

```bash
# 在部署环境执行；备份目录必须已通过清单校验。
node --env-file=apps/api/.env scripts/migrate-user-permissions.mjs --apply --business-database=nicerp --backup=/tmp/nicerp-permissions-release
npm run db:generate
```

启动方式延续当前项目 npm run dev 的服务管理方式；使用新 PID/日志记录服务状态。停止旧 API 后先生成最终一致性数据库备份、刷新计数与 SHA256 清单，再进行 DDL；不能用停服前的过期数据快照作为恢复基准。不把旧会话替换成新账号；新权限从每次 authenticate 即时加载。

- [ ] **Step 4：开放前检查。** Nest compile 0 errors、新路由存在、ready API 成功；role 六值、VIEWER=0、历史 owner 全 NULL、locale/active/业务金额行数与备份一致。执行 `npm run test:smoke`；只读 HTTP 检查中文/英文登录页及 LAN `http://172.24.71.48:3000/login`。经过批准使用测试账号或原测试库验证管理员编辑与销售范围，不在业务库批量修改真实负责人来做测试。
- [ ] **Step 5：失败时恢复，成功后交付。** 若迁移失败，数据库事务自动回滚；若新 API 未启动，保持写入口关闭并恢复旧 schema/源码配套备份后再启动，不只回退源码。验证通过才恢复写入口，最终说明“系统设置 → 用户权限”的使用方式、六角色、历史未分配入口和真实测试结果。提交名 `docs: document permission management and migration verification`。

## 计划自检结果

- 需求到任务：六角色/个人覆盖 1—3、8、10；本人/全公司与历史未分配 2、4—7、8；成本/采购价/利润/内部备注 1、5—7、9、11；会话即时更新与并发 3、6、7、11；中英文及个人设置 8—11；迁移和原业务保护 0、2、10—12。
- 接口一致性：后端与前端均使用 `access.permissions/access.scopes/access.version`；管理 PATCH 使用 `version/permissions/scopes`；数据库版本名为 permissionsVersion；负责人字段为 ownerUserId；DTO 投影不被内部计算复用。
- 审阅边界：每个任务都有独立验收结果和只提交该任务路径的检查点。仓库既有多语言改动不计入新任务提交。
- 执行方式由用户选择：分任务子代理或当前会话 executing-plans。此文件已制定步骤，尚未执行业务实现、迁移或测试。
