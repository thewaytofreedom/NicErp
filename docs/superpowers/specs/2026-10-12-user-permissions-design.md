# NicErp 用户权限管理设计

日期：2026-10-12。项目：`/var/www/html/NicErp`。

## 1. 已确认的需求

- 权限覆盖具体操作、数据范围和敏感字段。
- 数据范围只有“本人”和“当前公司全部”，不增加部门、团队或跨公司共享。
- 本人按负责人判定；新建资料默认由创建人负责，有分配权限的人可以调整。
- 报价、销售订单、采购订单、客户发票、供应商账单，以及客户/供应商主档均设负责人。
- 保留管理员、经理、销售、采购、仓库、财务六个角色，删除只读角色。采用角色默认权限与个人调整，不增加自定义角色或用户组。
- 个人调整按公司保存。操作及字段权限可继承、允许或禁止；数据范围可继承、本人或全公司。
- 控制四类敏感信息：成本、采购价格、利润、单据内部备注。可修改的敏感字段分别控制查看与修改。
- 历史资料负责人留空；只有相应全公司范围的用户可见，由管理员随后分配。不得根据历史日志猜测负责人。
- 管理员拥有当前公司的完整权限；个人调整不能削弱管理员。保留每家公司至少一名启用管理员的保护。
- 用户设置中的语言选择和修改本人密码继续向所有启用用户开放，不要求系统管理权限。

## 2. 当前系统与实施边界

NestJS API 使用 Prisma/PostgreSQL；Next.js App Router 通过现有 Cookie 代理调用 API。当前权限分散在 `common/context.ts` 的 `permit` 与前端 `lib/client.ts` 的 `can` 中，主要限制模块写入。列表、bootstrap、关联资料和统计尚未实施逐项读取及字段控制。单据、往来单位都没有负责人。

2026-10-12 的只读统计：业务库有 1 个 ADMIN 成员和 1 个 SALES 成员，没有 VIEWER 成员。执行迁移时再次检查；若届时出现 VIEWER 成员，迁移必须在任何 DDL 前中止并报告数量，不自动提升角色、删除账号或撤销成员资格。

本次只增加权限与负责人管理，不增加新的业务删除接口、部门、用户组、审批流或多公司共享。不恢复先前撤销的“从 CSV 生成报价”功能，也不改变原有产品编号/替代号匹配与货源规则。

项目已有 Git 仓库，但多语言功能仍有未提交改动。实施必须从当前完整工作目录创建隔离副本，不能只从 Git HEAD 创建一个遗漏多语言功能的工作树。所有自动化业务测试只写入 `nicerp_test`；运行中的业务库和 Next dev 构建目录不用于破坏性测试或生产构建。

## 3. 权限模型与默认角色

后端是权限规则唯一来源，前端使用后端返回的有效权限和权限目录。不得重新维护一套前端角色授权表。

| 角色 | 默认业务权限 | 默认数据范围 | 敏感字段查看 | 敏感字段修改 |
| --- | --- | --- | --- | --- |
| ADMIN | 当前公司所有现有功能及成员/权限管理 | ALL | 全部 | 可修改的全部 |
| MANAGER | 全部业务模块；不管理公司、成员和完整审计 | ALL | 全部 | 成本、采购价格、内部备注 |
| SALES | 产品及分类维护、客户/联系人维护、QUOTE/SALE 操作；本人 INVOICE 查看 | OWN | 内部备注 | 内部备注 |
| PURCHASING | 产品及分类维护、供应商/联系人及报价维护、PURCHASE 操作；本人 BILL 查看 | OWN | 成本、采购价格、内部备注 | 成本、采购价格、内部备注 |
| WAREHOUSE | 产品/分类查看、库存及仓库管理、SALE/PURCHASE 查看与收发货/退回 | ALL | 四类均隐藏 | 四类均禁止 |
| FINANCE | 产品/往来单位查看、SALE/PURCHASE 查看、INVOICE/BILL 操作、资金、毛利 | ALL | 全部 | 采购价格及内部备注；不维护产品成本 |

表内的业务操作仅限系统当前支持的动作。字段修改还需要对应业务修改权限；毛利是计算结果，没有修改权限。没有模块读取权限时，ALL 范围或字段允许均不产生访问能力。

权限覆盖采用 `Record<PermissionKey, boolean>`；省略表示继承，`false` 必须作为有效禁止保留。数据覆盖采用 `Partial<Record<ScopeKey, 'OWN' | 'ALL'>>`。管理 API 中 `null` 表示删除该覆盖、恢复继承，存储 JSON 中不保留 null。管理员的有效权限恒为全部允许和 ALL；对管理员提交非空个人覆盖返回 400。

数据范围键：`customers`、`suppliers`、`QUOTE`、`SALE`、`PURCHASE`、`INVOICE`、`BILL`。BOTH 往来单位通过允许的客户或供应商分支读取；修改 BOTH 主档及改变类型需要源类型和目标类型对应的修改权限。联系人继承所属往来单位的范围。

默认角色只是模板。六种角色都可以通过个人禁止实现只查看而不能写入，不再存在 VIEWER 角色、枚举值、菜单选项或新账号默认值。新建公司成员必须显式选择角色，不以销售或管理员作为隐式默认。

## 4. 权限目录与依赖

注册表为每一项提供稳定 key、中文标签、分组、默认角色、动作类别和依赖。默认拒绝未知 key。权限管理界面从注册表渲染。

- 产品：`products.read/create/update/import/export`；分类：`lookups.read/create/update/export`。
- 往来单位：`customers.read/create/update/import/export/assign`、`suppliers.read/create/update/import/export/assign`。
- 联系人：`contacts.read/create/update/export`。供应商价目：`supplierPrices.read/create/update/export`。
- 单据：`documents.<KIND>.read/create/update/clone/confirm/void/reopen/delete/convert/print/export/importLines/assign`；`accept/reject` 仅 QUOTE 注册；`convert` 仅 QUOTE、SALE、PURCHASE 注册。导入明细沿用现有接口，不新增导入报价入口。
- 履约：`inventory.ship/shipReturn/receive/receiveReturn`；库存：`inventory.read/adjust/transfer/export`；仓库：`warehouses.read/create/update/export`。
- 财务：`accounts.read/create/update/export`、`payments.read/pay/reverse/export`、`bankEntries.read/create/transfer/reconcile/reverse/export`、`margins.read/export`。
- 内容：`posts.read/create/update/export`；系统：`company.read/update/create`、`users.read/create/update/remove/managePermissions`、`audit.read/export`。系统管理动作仅 ADMIN，不可授予其他角色。
- 字段：`fields.cost.read/edit`、`fields.purchasePrice.read/edit`、`fields.margin.read`、`fields.privateNotes.read/edit`。

业务写操作和系统提供的打印/导出入口依赖其对象的读取权限。单据克隆还需目标 create，转换还需来源 convert、目标 create、来源可访问和目标往来单位可使用。收发货依赖 SALE/PURCHASE 读取与对应履约动作，不依赖销售/采购的修改权限。收付款及冲销依赖发票/账单读取、相应财务动作和账户读取；BILL 还必须可查看采购价格。

字段 edit 依赖同组 read；margin.read 必须有 cost.read、margins.read 和 INVOICE.read，否则毛利与销售额能反推出被隐藏成本。采购单/BILL 的 create、update、clone、importLines、convert-to-PURCHASE/BILL 等涉及金额的动作依赖 purchasePrice.read/edit。隐藏采购价格的人仍可按授权查看数量、日期、状态及执行收货。系统内计算及成本快照照常执行，不把前端可见性当作业务计算输入。采购取价或导入预览若回退使用产品参考成本，还必须具备 cost.read；没有该权限时不得把参考成本换算为采购单价返回，可返回不含金额的缺少可用报价提示。

修改覆盖后的最终权限必须满足依赖，不满足返回 400，指出冲突项并不写库。前端同步解释依赖并帮助勾选，但后端独立验证。

## 5. 存储与接口

Membership 增加 `permissionOverrides Json @default("{}")`、`scopeOverrides Json @default("{}")`、`permissionsVersion Int @default(1)`；Role 移除 VIEWER，Membership.role 删除默认值。

Document、Partner 增加可空 `ownerUserId @db.Uuid`、User 关联和公司/负责人索引。历史值保持 NULL。负责人必须是当前公司启用的成员；负责人列表只返回 id/name，不暴露邮箱、角色覆盖或密码信息。移除成员时，将其当前公司负责资料设为未分配，保留其他公司的归属；停用账号保留归属，管理员仍可重新分配。

`auth/me` 和 `erp/bootstrap` 增加 `access: { permissions, scopes, version }`，每次请求从当前成员信息计算；不将权限固化在会话令牌中，不使用跨请求的用户权限缓存。

新增 API，均在 `/api/v1` 下，并通过现有 `/api/backend` 代理访问：

| 接口 | 授权及行为 |
| --- | --- |
| GET erp/permissions/catalog | 当前公司管理员；返回六个角色默认模板、操作目录、字段目录、范围目录及依赖 |
| GET erp/users/:id/permissions | 管理员；目标必须是当前公司成员；返回角色、覆盖、有效权限及版本 |
| PATCH erp/users/:id/permissions | 管理员；body 为 `{ version, permissions, scopes }`；更新部分覆盖；缺少/过期版本返回 409；非法 key、类型、范围、依赖返回 400；审计变更前后差异 |
| GET erp/owners | 具备至少一项 assign 且对应范围 ALL；只列当前公司启用成员 id/name |
| POST erp/ownership/assign | `{ resource: 'documents'|'partners', ids: UUID[], ownerUserId: UUID|null, versions?: Record<UUID,number> }`；一次最多 100 条；按实际 kind/type 检查 assign + read + ALL；文档要求逐条 version；事务内全成功或全失败，记录审计 |

身份 API 不接受权限覆盖；用户不能通过本人语言设置、密码修改或普通业务表单修改角色、授权或负责人。角色切换和成员启停仍使用现有用户 CRUD，权限版本同步递增；普通角色切换保留个人覆盖并校验新的最终权限，提升管理员时清空个人覆盖，保留现有最后一名管理员保护。

新建资料负责人默认当前用户；普通 create/update 不允许在 body 偷渡 ownerUserId。分配走独立接口。复制和转换属于创建新单据，默认由执行人负责；可在完成后通过分配接口调整。旧资料编辑、确认、履约不自动变为操作者所有。

## 6. 查询、字段与写入边界

所有数据库查询先施加公司、模块、类型和负责人过滤，再分页、计数或聚合。OWN 对 NULL 不匹配。详情查询使用相同谓词；无权记录与不存在记录同样返回 404，缺少整个模块/动作权限返回 403，账号失效返回 401。

覆盖列表、搜索、产品匹配、bootstrap 下拉、联系人、供应商价目、单据详情/关联源与子单、库存关联单据、收付款、毛利 SQL、工作台、导出、打印和写入返回值。没有权限的 bootstrap 资源返回空数组，不返回未过滤完整资料。工作台只计算获准类型和范围内的资料，未知金额不以 0 冒充。

单据负责人和往来单位负责人独立。授权查看某张单据允许查看该单据当时必需的往来单位快照；不因此允许读取当前往来单位主档、联系人或其他单据。嵌套 `partner`、`source`、`children` 按自身权限过滤，仅返回允许的安全摘要。

字段脱敏使用显式、非原地 DTO 投影，删除无权字段，不能返回真实值、0、空字符串或隐藏在嵌套对象中。不能先脱敏内部单据再用它进行克隆/计算；内部完整数据与公开 DTO 分开。

- cost：Product.costPrice、组合组成成本及组件成本、DocumentLine.unitCost、成本聚合。
- purchasePrice：供应商价目 unitPrice/折扣/价格计算结果，PURCHASE/BILL 的单价、折扣、税率、行金额、subtotal/taxTotal/total/paidAmount、相关付款金额/余额及采购取价预览。
- margin：工作台参考毛利，毛利报表的 cost/grossProfit/marginRate/markupRate；无权直接访问毛利报表返回 403。
- privateNotes：Document.privateNotes；外部打印继续始终排除内部备注，即使打印者可查看内部备注。

修改无权字段返回 403；省略字段不得用默认零/空值覆盖数据库旧值。产品创建未提供成本时可由服务器保存默认零；单据成本始终由服务器计算，客户端 unitCost 不作为可信输入。成本自动计算不要求操作者拥有成本修改权限。

权限及归属在写事务内重新读取，使用现有 Serializable + 冲突重试。重复请求返回缓存业务结果之前也必须检查当前授权、记录范围和字段投影，防止权限撤销后借旧幂等键取回数据。

## 7. 前端与回归

用户权限编辑器放在现有“系统设置 → 用户权限”中，不改用户设置 tab=4 的地址。展示角色默认值、个人覆盖、最终值、范围和依赖；管理员权限不可覆盖；版本冲突提示刷新，不默默覆盖他人改动。

菜单、页签、新增/编辑/确认/删除/作废/转换/收发货/收付款/打印/导入/导出按钮按各自权限显示。字段只读与隐藏区分；缺少价格字段时移除对应列及金额卡片，不显示 0。后台拒绝仍是最终保障。无管理员权限的人仍能打开本人语言与密码设置。

中文/英文均支持；新增文本纳入英文词典。业务名称、描述、备注仍保留原文。

验证包括权限默认/覆盖/依赖单元测试，隔离数据库 API 测试，六个角色与同角色不同个人覆盖、跨公司、旧会话即时变更、未分配历史资料、归属转移、字段不出现在 JSON/RSC/导出/打印、不能偷渡写入、报表范围、幂等与并发保护，以及已有报价序号、CSV、资金库存、多语言及完整浏览器回归。

## 8. 上线边界

先在隔离副本完成红绿测试和生产构建，再备份受影响源码、数据库结构、成员及权限/归属相关数据。确认 VIEWER 数量为 0、SQL 仅涉及本设计，再停下 API 写入口、事务迁移、生成客户端、切换代码及重启。不能在旧 API 仍可创建 VIEWER 时直接删除数据库枚举。停止旧 API 后生成最终一致性备份，作为实际恢复基准。

迁移失败事务回滚；迁移后启动失败保持写入口关闭，使用迁移前数据恢复旧枚举、默认和源码后再开放。仅回滚新增列会丢失上线后分配及授权，因此生产开放前必须完成检查；上线后回退需要恢复配套备份，不直接 DROP 列。

本轮产出设计与实施计划，不执行业务代码或数据库变更。
