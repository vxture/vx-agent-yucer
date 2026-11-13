# 全平台操作组件与页面入口检查

日期：2026-11-13。范围为本机聿策开发环境；本轮不发布。

## 统一规则

| 检查项 | 本轮落地 |
| --- | --- |
| 常规按钮、单行输入、筛选、下拉、图标按钮 | DS 32px 高，12px 字体；图标按钮宽高一致 |
| 重点主按钮 | 主新建 xl/default、表单主提交可 14px；不将所有次要按钮放大 |
| 24px 紧凑操作 | 树折叠、表头排序、表格行展开、卡片折叠、产品排序、行内证据、浮层关闭 |
| Tabs / SegmentedControl | 外组 32px；内部使用 DS 的内嵌间距与结构，标签 12px |
| 三点操作 | 32px 按钮、20px 图标；保留原 DS 确认、权限、禁用与焦点行为 |
| 菜单、下拉选项 | 12px；菜单行最小 32px，含描述的内容允许自然增高 |
| 多行输入 | 12px，保留多行高度，不压为 32px |
| 页面与浮层 | 同一 RootLayout/body token 适配，包含 portal 下的抽屉、对话框与 Popover |
| 页头 | 保留 32px 外容器；Launcher 图标 24px，其余图标按原 DS 语义；租户按钮文字统一 12px |

适配继续复用 TD-038 的 `business-controls.module.css`，未复制或修改 DS 组件。
字体、高度和图标尺寸均引用现有 DS token；颜色、圆角、阴影、键盘与危险操作确认保持 DS 行为。

## 明确保留的例外

| 场景 | 保留原因 |
| --- | --- |
| 五种公开访问状态的主/次 CTA 48px / 14px | 沿用用户已确认的 Ruyin 家族公开页规范，`preserve` 显式登记 |
| Launcher 模块与域标题 40px | 沿用此前确认的面板展位，不作为普通工具栏按钮处理 |
| Checkbox / Radio / Switch / Slider 图形 | 保留 DS 图形尺寸与已有命中区，不把图形放大为 32px |
| 整行展开、列表/卡片标题、对象选择卡片 | 属于内容或结构激活，自然高度；不强制裁短内容 |
| 地图几何折叠弧、账龄可视化阈值轨道 | 命中区域与可视化数据/几何有关；普通大屏操作仍按 32px / 24px |
| 信息标题、用户名、徽章、品牌字标、正文 | 不属于操作文字；保留 DS 内容字阶，避免把全页面内容压成 12px |

## 页面与入口清单

逐条登记全部 79 个独立页面，70 个 `@deck` 并行页面附着于对应业务路由，
属于共享侧栏插槽，不是额外入口或孤儿页面。表中“侧栏”对应已检查的附着页。
入口证据经过人工核对，缓存失效、自身面包屑和仅有 URL 字符串不作为入口依据。

浏览器检查为当前演示数据、已购档位与管理员视角的页面初始状态；并不代表每一条
业务写入、每一个权限组合或每个弹层分支都已实际执行。浮层和公开状态另见后续清单。

| 路由 | 入口分类及来源 | 侧栏 | 浏览器检查 |
| --- | --- | --- | --- |
| `/account/[id]/evidence/[evidenceId]` | 业务上下文 · `domains/copilot/lib/citations.ts` | 已核对 | 通过：10 个可测控件 |
| `/account/[id]` | 业务上下文 · `components/account-table.tsx` | 已核对 | 通过：49 个可测控件 |
| `/account/complete` | 业务上下文 · `components/account-completeness.tsx` | 已核对 | 通过：12 个可测控件 |
| `/account/new` | 业务上下文 · `account/page.tsx` | 已核对 | 通过：25 个可测控件 |
| `/account` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：47 个可测控件 |
| `/admin/audit` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：19 个可测控件 |
| `/admin/diagnostics` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：21 个可测控件 |
| `/admin/division/[id]` | 业务上下文 · `components/division-panel.tsx` | 已核对 | 通过：26 个可测控件 |
| `/admin/division/new` | 业务上下文 · `components/division-panel.tsx` | 已核对 | 通过：20 个可测控件 |
| `/admin/division` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：30 个可测控件 |
| `/admin/industry` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：91 个可测控件 |
| `/admin/members/[id]` | 业务上下文 · `components/member-panel.tsx` | 已核对 | 通过：16 个可测控件 |
| `/admin/members` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：85 个可测控件 |
| `/admin/migration` | 兼容跳转 · `admin/migration/page.tsx` | 已核对 | 通过：跳转后控件一致 |
| `/admin/opportunity` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：131 个可测控件 |
| `/admin/org/[id]` | 业务上下文 · `components/org-panel.tsx` | 已核对 | 通过：24 个可测控件 |
| `/admin/org/kinds` | 业务上下文 · `admin/org/page.tsx` | 已核对 | 通过：29 个可测控件 |
| `/admin/org/new` | 业务上下文 · `components/org-panel.tsx` | 已核对 | 通过：24 个可测控件 |
| `/admin/org` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：52 个可测控件 |
| `/admin` | 导航 / 父级操作 · `components/header-tools.tsx` | 已核对 | 通过：11 个可测控件 |
| `/admin/permissions` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：123 个可测控件 |
| `/admin/product` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：74 个可测控件 |
| `/admin/reminder` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：18 个可测控件 |
| `/admin/roles/[id]` | 业务上下文 · `components/role-panel.tsx` | 已核对 | 通过：35 个可测控件 |
| `/admin/roles/groups` | 业务上下文 · `admin/roles/page.tsx` | 已核对 | 通过：50 个可测控件 |
| `/admin/roles/new` | 业务上下文 · `components/role-panel.tsx` | 已核对 | 通过：24 个可测控件 |
| `/admin/roles` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：47 个可测控件 |
| `/admin/scope` | 导航 / 父级操作 · `lib/admin-nav.ts` | 已核对 | 通过：44 个可测控件 |
| `/attainment/coverage` | 导航 / 父级操作 · `lib/attainment-workspace.ts` | 已核对 | 通过：47 个可测控件 |
| `/attainment` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：69 个可测控件 |
| `/campaign/create` | 业务上下文 · `campaign/page.tsx` | 已核对 | 通过：23 个可测控件 |
| `/campaign/new` | 业务上下文 · `components/execution-panel.tsx` | 已核对 | 通过：20 个可测控件 |
| `/campaign` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：25 个可测控件 |
| `/capture` | 业务上下文 · `account/[id]/page.tsx` | 已核对 | 通过：18 个可测控件 |
| `/catalog/new` | 业务上下文 · `components/product-roster.tsx` | 已核对 | 通过：32 个可测控件 |
| `/catalog` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：29 个可测控件 |
| `/collection/instalment` | 业务上下文 · `collection/page.tsx` | 已核对 | 通过：16 个可测控件 |
| `/collection` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：134 个可测控件 |
| `/contact/new` | 业务上下文 · `account/[id]/page.tsx` | 已核对 | 通过：25 个可测控件 |
| `/copilot` | 业务上下文 · `components/agent-capture.tsx` | 已核对 | 通过：103 个可测控件 |
| `/delivery/new` | 业务上下文 · `components/delivery-roster.tsx` | 已核对 | 通过：19 个可测控件 |
| `/delivery` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：111 个可测控件 |
| `/delivery/project` | 业务上下文 · `components/delivery-roster.tsx` | 已核对 | 通过：22 个可测控件 |
| `/domain/[key]` | 业务上下文 · `components/domain-launcher.tsx` | 已核对 | 通过：10 个可测控件 |
| `/forecast` | 兼容跳转 · `forecast/page.tsx` | 已核对 | 通过：跳转后控件一致 |
| `/funnel` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：9 个可测控件 |
| `/lead/new` | 业务上下文 · `components/lead-list.tsx` | 已核对 | 通过：14 个可测控件 |
| `/lead` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：126 个可测控件 |
| `/named` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：27 个可测控件 |
| `/` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：69 个可测控件 |
| `/pipeline/[id]/lines` | 业务上下文 · `pipeline/[id]/page.tsx` | 已核对 | 通过：36 个可测控件 |
| `/pipeline/[id]` | 业务上下文 · `components/pipeline-board.tsx` | 已核对 | 通过：75 个可测控件 |
| `/pipeline/new` | 业务上下文 · `pipeline/page.tsx` | 已核对 | 通过：23 个可测控件 |
| `/pipeline` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：56 个可测控件 |
| `/planning/new` | 业务上下文 · `planning/legacy-planning.tsx` | 已核对 | 通过：18 个可测控件 |
| `/planning` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：35 个可测控件 |
| `/planning/territory/new` | 兼容跳转 · `planning/territory/new/page.tsx` | 已核对 | 通过：跳转后控件一致 |
| `/pricebook` | 兼容跳转 · `pricebook/page.tsx` | 已核对 | 通过：跳转后控件一致 |
| `/quote` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：49 个可测控件 |
| `/renewal` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：32 个可测控件 |
| `/segment/new` | 业务上下文 · `components/market-library.tsx` | 已核对 | 通过：27 个可测控件 |
| `/segment` | 兼容跳转 · `segment/page.tsx` | 已核对 | 通过：跳转后控件一致 |
| `/signal` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：285 个可测控件 |
| `/solution/new` | 业务上下文 · `components/solution-advice-panel.tsx` | 已核对 | 通过：27 个可测控件 |
| `/solution` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：20 个可测控件 |
| `/strategy/[id]` | 业务上下文 · `components/strategy-workspace.tsx` | 已核对 | 通过：22 个可测控件 |
| `/strategy/new` | 业务上下文 · `components/strategy-workspace.tsx` | 已核对 | 通过：22 个可测控件 |
| `/strategy` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：20 个可测控件 |
| `/upgrade/[module]` | 业务上下文 · `components/domain-launcher.tsx` | 已核对 | 已购时正确跳转；锁定模板静态核对 |
| `/winloss` | 导航 / 父级操作 · `lib/navigation.ts` | 已核对 | 通过：45 个可测控件 |
| `/entitlement-matrix` | 开发验证 · `admin/diagnostics/page.tsx` | 不适用 | 通过：0 个可测控件 |
| `/gate-screens` | 开发验证 · `admin/diagnostics/page.tsx` | 不适用 | 通过：6 个可测控件 |
| `/platform-check` | 独立诊断 · `admin/diagnostics/page.tsx` | 不适用 | 通过：0 个可测控件 |
| `/product-preview` | 开发验证 · `admin/diagnostics/page.tsx` | 不适用 | 通过：28 个可测控件 |
| `/progression-preview` | 开发验证 · `admin/diagnostics/page.tsx` | 不适用 | 通过：15 个可测控件 |
| `/status` | 独立诊断 · `admin/diagnostics/page.tsx` | 不适用 | 通过：0 个可测控件 |
| `/enablement` | 导航 / 父级操作 · `lib/navigation.ts` | 不适用 | 通过：1 个可测控件 |
| `/national` | 导航 / 父级操作 · `lib/navigation.ts` | 不适用 | 通过：17 个可测控件 |
| `/strategy-diag` | 导航 / 父级操作 · `lib/navigation.ts` | 不适用 | 通过：1 个可测控件 |

## 入口治理与删除结果

- `/account/complete` 有客户资料完整度的真实菜单入口，清除“功能无入口”的过时判断。
- 删除配置导航中的“待迁移”菜单与其旧 UI、专属中英文文案；`/admin/migration` 保留到 `/admin` 的兼容跳转。
- `/status`、`/platform-check` 接入配置管理“系统验证”，继续可在工作台故障时直接访问；接口原鉴权不变。
- `/gate-screens`、`/product-preview`、`/progression-preview`、`/entitlement-matrix` 的统一入口仅在开发环境的系统验证页显示，不进入正式业务或登录导航。本轮未扩大其已有 URL 访问权限。
- `/forecast`、`/pricebook`、`/segment`、`/planning/territory/new` 保留历史地址兼容，按原规则传递上下文；无需人为补回重复业务菜单。
- 动态功能域、客户/商机/战略详情、证据、新建/编辑、跟进记录和升级页保留上下文入口，不为追求“每页都在 Launcher”而重复导航。
- 删除确认零导入、零调用的 6 个旧组件：`board-chart.tsx`、`chain-recency.tsx`、`decision-chain.tsx`、`forecast-scope-picker.tsx`、`headline-card.tsx`、`raised-card.tsx`。现有决策链详情、客户热度、承诺达成与规划能力均未删去。
- TD-008 因旧本地实现退役关闭，保留历史记录；不宣称上游 DS 已补齐当年的全部图表接口。

## 控件声明覆盖

扫描 829 个非测试 TS/TSX 源文件，识别 897 处操作控件或复合入口声明。下表为源码声明数量，不是渲染出的 DOM 数量，组合控件内部复用同一适配。

| 组件 | 声明数量 |
| --- | --- |
| `Button` | 345 |
| `CollapsibleTrigger` | 9 |
| `Drawer` | 45 |
| `ConfirmDestructive` | 13 |
| `NativeSelect` | 117 |
| `Input` | 183 |
| `ActionMenu` | 14 |
| `FilterBar` | 27 |
| `button` | 29 |
| `Textarea` | 25 |
| `TabsList` | 7 |
| `TabsTrigger` | 14 |
| `SelectTrigger` | 2 |
| `BulkActionBar` | 6 |
| `DialogForm` | 30 |
| `SegmentedControl` | 8 |
| `AlertDialogTrigger` | 1 |
| `DestructiveButton` | 5 |
| `PopoverTrigger` | 2 |
| `ToggleGroupItem` | 3 |
| `input` | 5 |
| `Combobox` | 1 |
| `ViewModeSwitch` | 1 |
| `Pagination` | 1 |
| `Link` | 4 |

所有项目内原生按钮已明确区分 operation、structural 或 visualization；原生 input
只保留既有 checkbox / radio，未引入另一套文本输入、选择器或按钮组件。扩展检查会
拒绝未分类的原生操作、未登记的 preserve 例外、未登记页面及无入口的 TSX 模块。

## 浮层与公开状态复核

| 场景 | 控件检查 |
| --- | --- |
| 战略关联细分市场抽屉 | 通过 · 26 个可测控件 |
| 战略关联方案抽屉 | 通过 · 26 个可测控件 |
| 战略目标市场操作菜单 | 通过 · 23 个可测控件 |
| 战略市场投入设置 | 通过 · 27 个可测控件 |
| 战略客户关联抽屉 | 通过 · 49 个可测控件 |
| 规划检查抽屉 | 通过 · 46 个可测控件 |
| 配置新建类型弹窗 | 通过 · 136 个可测控件 |
| 区域设置列表操作菜单 | 通过 · 37 个可测控件 |
| 区域设置真实编辑页入口 | 通过 · 26 个可测控件 |
| 成员管理列表操作菜单 | 通过 · 48 个可测控件 |
| 成员管理真实编辑页入口 | 通过 · 16 个可测控件 |
| 组织架构列表操作菜单 | 通过 · 62 个可测控件 |
| 组织架构真实编辑页入口 | 通过 · 24 个可测控件 |
| 角色管理列表操作菜单 | 通过 · 56 个可测控件 |
| 角色管理真实编辑页入口 | 通过 · 35 个可测控件 |
| Header 用户面板 | 通过 · 27 个可测控件 |
| Header 组织面板 | 通过 · 22 个可测控件 |
| Launcher 面板 | 通过 · 46 个可测控件 |
| Launcher 选中后关闭 | 通过 · 56 个可测控件 |
| 未登录引导页 | 通过 · 6 个可测控件 |
| 恢复登录页 | 通过 · 5 个可测控件 |
| 未订阅页 | 通过 · 7 个可测控件 |
| 无角色页 | 通过 · 7 个可测控件 |
| 已退出页 | 通过 · 7 个可测控件 |
| 780px 窄屏抽屉 | 通过 · 48 个可测控件 |

## 验证与边界

- 浏览器覆盖全部 79 个路由样例（含兼容跳转与升级页的已购分支），检查 3,194 个可测控件；另复核 25 项浮层、菜单与公开状态，均无未解决尺寸偏差。
- DS ShellPanelRow 内层显式字阶一并继承操作按钮字号，Header 用户/组织面板已复测；用户身份、徽章和正文保留内容字阶。
- 全量单元测试：3,293 项；2,857 通过，0 失败，436 按既有规则跳过（未连接真实数据库）。
- 类型检查、文档编号、空白/冲突检查、页面入口和原生控件检查分别验证。
- 本轮没有修改业务保存规则、服务授权、数据库结构或真实业务数据；浏览器验证不提交表单、不执行探测/收费或删除动作。
- 开发服务曾因批量编译的内存压力自动重启。受中断影响的记录单独重跑，连接失败不视为通过。
- 升级路由在当前全权益演示会话下正确回到已购模块；锁定模板由静态入口与现有权益测试核对，未通过降档改写本机会话。
- 不把本轮的本地检查称为已上线或真实业务写入验收。

## 复跑方式

```sh
pnpm lint:page-surfaces
node scripts/guardrails/check-page-surfaces.mjs --json /tmp/yucer-surfaces.json
node scripts/qa/audit-page-controls.mjs --tab <dedicated-cdp-tab-id>
node scripts/qa/verify-control-overlays.mjs --tab <dedicated-cdp-tab-id>
```

浏览器脚本要求已经启动的本机服务、CDP 浏览器及单独评审标签页，只操作指定标签；
结束时恢复地址和视口。默认报告输出到 `/tmp`。入口清单可逐页反查到
`scripts/guardrails/page-surfaces.json`，构建检查执行同一份入口/孤立 UI 检查。
