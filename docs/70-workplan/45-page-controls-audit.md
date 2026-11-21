# 全平台操作组件与页面入口检查

日期：2026-11-13。范围为本机聿策开发环境；本轮不发布。

2026-11-15 补充：资料创建/编辑表单采用标签 12px 辅助色、内容 14px 正文色；
下表的 12px 输入规则继续用于操作行与筛选。新字阶与客户登记流程的复核清单见
[50-business-forms-registration.md](50-business-forms-registration.md)。

## 2026-11-18 页头与清单交互复核

- 一级标题沿用 DS ViewHeader。页级职责（新建、邀请、发布、版本、配置）集中在右侧；标准新建共用
  32px 高、14px 文字、品牌主色和加号，默认位于同组末尾。普通操作 32px / 12px，紧凑操作限既有 24px 档。
- 页头右侧共用视图、全页筛选、次操作、主操作、更多五个槽位。次操作统一描边，
  主操作统一品牌实底；窄屏右对齐换行。销售规划单独归组年度和版本、检查与保存、发布及版本菜单；
  承诺达成单独归组视图、视角、周期和提交；组织、区域、角色、成员及战略详情沿用同一结构。
  入口扫描会阻止业务页绕过共享 ViewHeader；浏览器审计新增主次样式和三点图标尺寸检查。
- 二级清单用同一 FilterBar 结构：左侧名称与图标，按需接视图切换和统计；
  右侧搜索、筛选、清单操作与三点菜单。桌面左右对齐，窄屏同组换行。
- 复核清单：战略、细分市场、解决方案、产品目录；客户、资料补齐、战略客户、商机、
  战役、线索、报价、交付、回款、续约、复盘；销售规划、承诺达成、预测差异、信号、智能提案；
  审计、区域、组织、角色、成员、权限和各业务词表。客户和商机档案仍保留业务侧栏标题与面包屑；
  表单、公开页、只读分析和兼容入口按各自职责检查，单视图不补假切换，无操作区不补空菜单。
- 表格只有在确有批量操作、市场比较或产品定价分析时才启用选择。默认序号，
  指针悬停、键盘聚焦或已有选择时同列显示复选框；勾选按记录 ID 保存，不受排序影响。
  全选作用于当前显示范围，取消同范围全选保留其他页的选择。点击名称看记录，点击三点处理单条；
  选择文字不触发选中。交付、区域周期的行展开保留；智能提案同时依赖批量裁决与展开证据，保留 DS 双轨。
  产品的退役清单和排序页不提供选择。线索批量删除仍需确认。
- 模式参考：[Carbon 数据表](https://www.carbondesignsystem.com/components/data-table/usage/) 的选择与批量操作栏、
  [MUI 行选择](https://mui.com/x/react-data-grid/row-selection/) 的交互单元格、分页选中处理。
  64px 同列切换是聿策对空间密度的选择，依赖记录操作有独立入口；表格适配退出条件见 TD-038。

- 验证：静态扫描 80 个页面、71 个并行槽位，零错误。桌面浏览器用本机演示数据巡检
  80 条路由样本，复测后 3,680 个控件无尺寸或字阶偏差；成员、组织、角色编辑分别用
  已验证入口到达的记录 ID 复查。390px 检查客户和战略四页均无页面横向溢出。
  另点测产品选中、取消、当前范围全选、键盘空格、名称与行菜单互不干扰；
  细分市场比较抽屉、交付行展开和线索删除确认（取消，未写入）通过。
- 页头补充复测：组织、角色、战略配置页正常渲染；销售规划和承诺达成的主次操作、
  全页筛选及更多菜单实测通过。战略、销售规划、承诺达成、组织架构在 390px 下无横向溢出。
  类型检查、文档检查和全量测试通过：3,027 项通过，466 项因无数据库连接跳过。


## 2026-11-17 市场入口与关联抽屉复核

细分市场恢复 `/segment` 独立入口，与战略规划、解决方案、产品目录同属一个功能域；
战略页只保留总览与执行验证。`/strategy?view=markets&market=UUID` 保留兼容跳转和市场定位。
同步修正创建表单返回、战略卡片、方案引用、检查建议和功能域统计入口；
权限树按独立模块展示，权限码、权益门、工作区边界及 UUID 关联保持原规则。

| 检查项 | 本地结果 |
| --- | --- |
| 战略关联市场、通用产品方案、市场级产品方案 | 统一 DS `md` 512px 抽屉；390px 窄屏自动适配，无横向溢出 |
| 产品方案选择 | 直接列出启用项，方案与产品分组；搜索、多选、计数，使用不同图标 |
| 草稿交互 | 搜索不丢选项；取消还原；确认一次带回多类卡片；市场默认方案仍可继承 |
| 细分市场新建/修改 | 复用同一产品方案清单，避免两套选择行为 |
| 独立入口与旧链接 | 旧链接保留 UUID 并打开正确详情；战略总览与执行验证正常 |
| 权限、生命周期、继承与入口测试 | 166 项通过 |
| 浏览器验证 | 24 项通过，无运行时异常；只操作本地草稿，未保存业务数据 |
| 编译与静态检查 | 类型检查、生产构建、页面入口与组件审计、文档编号检查通过 |

本轮无数据库变更，尚未发布。

## 统一规则

| 检查项 | 本轮落地 |
| --- | --- |
| 常规按钮、单行输入、筛选、下拉、图标按钮 | DS 32px 高，12px 字体；图标按钮宽高一致 |
| 重点主按钮 | 主新建 xl/default、表单主提交可 14px；不将所有次要按钮放大 |
| 抽屉决策操作（2026-11-21 修正） | 保存、取消、确认、关闭及工作流决策采用 DS xl：32px 高、14px 字号，同栏主次按钮一致；显式 drawer-action 标记，表格行内工具与收起/关闭图标不随之放大 |
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
| `/copilot` | 导航 / 助手底部 · `lib/functional-domains.ts` | 已核对 | 通过：103 个可测控件 |
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
| `/segment` | 独立入口 · Launcher「细分市场」 | 已核对 | 独立维护，旧 `/strategy?view=markets` 兼容跳转 |
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
- 类型检查、文档编号、空白/冲突检查、页面入口和原生控件检查分别验证；发布前新增 8 项入口守卫回归并通过。
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
结束时恢复地址和视口。默认报告输出到系统临时目录内由 `mkdtemp` 创建的独立目录；`--out` 可显式指定结果文件。入口清单可逐页反查到
`scripts/guardrails/page-surfaces.json`，构建检查执行同一份入口/孤立 UI 检查。


## 2026-11-14 战略编辑/查看复核

- `/strategy/new`：DS 基本信息卡，周期选择与自定义、成员 Combobox、草稿关联卡片。
- `/strategy/new?no=...`：只开放草稿编辑；批准、执行、结束及归档均回查看页。
- `/strategy/[id]`：基本信息折叠、目标市场、主推方案；无关联/投入编辑按钮。
- 市场/方案抽屉只应用到表单草稿，整体提交才写入；复用同一控件尺寸契约。
- `verify-control-overlays.mjs` 已迁移到新建页检查草稿抽屉，避免测试依赖已删除的查看页编辑入口。
- 自动创建人只插入；历史未知如实显示；负责人候选与服务端校验均按当前工作空间。

后续同日追加版本修订、发布确认及历史抽屉，见 ADR-039 补充与市场战略设计 11.12。

本轮验证记录：

- 完整应用测试：3,304 项，2,867 通过、437 项数据库测试在无连接的该轮跳过，零失败。
- 独立 PostgreSQL 测试库应用 0109 后，战略适配器 36 项真实数据库测试全部通过。
- 类型检查与隔离目录生产构建通过；111 张表 DDL/Prisma 一致；79 页面、70 平行槽位入口清单零错误。
- 浏览器验证创建/修改往返、自定义周期、关联成员、市场/方案草稿应用与取消、只读查看、
  批准后编辑重定向、780px 窄屏；三个战略抽屉分别 25/25/27 个控件，尺寸规范零违例。
- 本轮为本地实现与验收，未执行生产迁移或应用发布。


### 战略版本补充复核（2026-11-14）

发布/放弃统一使用 DS DialogForm，历史使用 DS Drawer。浏览器实测新建页 21 项、修订页
21 项、发布确认 20 项、版本历史 21 项、正式详情 18 项、780px 详情 17 项及编辑页
20 项控件，均无高度或字号违规；窄屏页面无横向溢出。基本卡、目标市场、主推方案及查看
只读边界保持一致，历史内容不暴露关联编辑入口。


### 战略基础表单三列与自动编号（2026-11-14）

采用标题在上、内容在下的等宽三列：战略名称 / 周期 / 负责人；战略方向和修订说明各占整行。
编号移到卡片底部辅助区，默认按周期生成，创建前可在 DS Popover 改用企业编码或恢复自动。
创建人保留卡头右侧。已保存战略的编号只读，调整周期与发布修订不改变编号。

浏览器 1600px 三列输入框实测均为 338px，顶部一致；780px 自动折行且页面无横向溢出。
新建 19 项、编号浮层 22 项、已存编辑 18 项、窄屏编辑 18 项及浮层 21 项控件检查均通过。
已验证周期联动、手动编码不被周期覆盖、恢复自动、成员选择、保存与再次修改后编号稳定。
95 项领域回归与 7 项真实 PostgreSQL 版本/编号契约通过，含并发重号及服务端自动重试；
类型检查和页面控件清单检查通过（79 页、70 并行槽、910 控件声明）。
本地截图 `/tmp/yucer-strategy-basic-three-columns.png`，本轮未发布。


### 日期范围优先的周期组件（2026-11-14）

进一步重构为 `strategy-period-field.tsx`：主控件直接显示起止日期；DS Popover 内始终呈现
开始/结束日期，年度、季度为下方快捷填充。移除类型选择及跨三年清单，自定义不再是单独模式。
预设后可直接调整日期，应用/取消边界清晰。全部使用现有 DS 32px 控件、12px 文本及宽度档位。

浏览器逐态检查：主表单 19 项、日期浮层 29 项、跨年输入 29 项、已保存表单 18 项、
780px 表单 18 项及浮层 28 项，均无控件高度/字号违规，窄屏无横向页面溢出。
完整起止日期在主字段可见，浮层采用 DS `xl` 宽度以容纳两端日期，未添加独立类型选择。
入口清单更新为 79 页、70 并行槽、833 源文件、916 控件声明，零错误。


### 周期字段精简与成组（2026-11-14）

周期名称移到标题后，不在内容下方占行；根据所选日期识别自然年度/季度，
其他范围显示「自定义周期」。日期手动调整后也会重新识别。浮层删除重复标题、
快捷说明及首尾日期说明；年份输入与年度/Q1-Q4 使用 DS ButtonGroup 相连并排，
第二行保留起止日期，底部保留取消/应用。未改动保存及版本冻结规则。

浏览器验证年度、季度、自定义、直接输入日期后的自动识别及取消：1600px 主表单
19 项 / 浮层 29 项，780px 主表单 18 项 / 浮层 28 项控件，无字号或高度违规；
快捷项与年份均为同一行相连的 32px 控件，无横向溢出。类型检查、79 页 / 916 控件
入口清单及 diff 检查通过。截图 `/tmp/yucer-strategy-period-compact-panel.png`、
`/tmp/yucer-strategy-period-compact-editor.png`。本地已更新，未上线。

周期组选中态补正：保留 DS secondary 背景/文字变化，使用同一 `border-control-border`
语义 token 维持选中与未选中项的 1px 连续边线；保留键盘焦点环。


### 周期组件接入已发布 DS（2026-11-14）

消费 Design System 15.6.1 / Design UI 12.5.1 / Design Tokens 4.1.0，锁文件保留单一
Design UI 版本。战略周期切换改用 DS SegmentedControl，起止使用 DS DatePicker，
前置日历图标；浮层根据 DS 宽度与留白档位收紧。分段保持等宽、统一边线、无按压位移，
选中使用品牌蓝底与白字。按用户本地日期读取选择结果，再交由既有周期规则校验。

浏览器验证真实点击按下与释放时布局稳定、日期面板独立开关、自定义日期应用、
1600px / 780px / 390px 下浮层控件适配。类型检查、生产构建、入口和文档检查通过；
完整测试 3,327 项：2,882 通过、445 个需连接数据库的项目跳过、0 失败。
本地截图 `/tmp/yucer-strategy-period-ds-panel.png`。本轮未上线。

### 人员整体展示与市场默认方案（2026-11-14）

| 检查范围 | 修正与验证 |
| --- | --- |
| 人员展示 | 共用 MemberName：DS 24px 头像与显示名为不换行整体；工作区目录提供真实头像，缺失时使用 DS 默认头像 |
| 人员选择 | 共用 MemberPicker：DS Popover/Command，姓名检索，保存成员标识；负责人、执行人、组织负责人等复用 |
| 战略编辑标题 | 战略名称实时同步到页头，编号为副标题；基本信息与两个关联板块同级，创建人居右 |
| 市场独立维护 | 市场编辑页维护默认解决方案；详情只读，未读取到目录时不覆盖原关联 |
| 战略继承 | 新选市场带入启用方案，战略内可调整、清空；市场后续调整不改变已有战略 |
| 浏览器代表页 | 客户、线索、成员管理、销售规划、承诺达成、客户详情、商机详情的操作尺寸通过；已显示的人员整体无换行、头像为 24px |
| 编辑交互 | 姓名搜索、选择回显、名称实时同步、市场方案自动带入、只读查看通过；700px 编辑页无横向溢出 |

全量测试 3,330 项：2,884 通过、446 个需连接数据库的项目跳过、0 失败。
另在隔离 PostgreSQL 数据库执行战略存储与版本测试 45 项全部通过，覆盖新关联表的
事务回滚、工作区隔离、引用删除保护及服务账号权限。完整 DDL 从零升级演练通过。
最终补检人员、字号、入口与错误映射 14 项通过，类型检查与生产构建通过。
79 个页面、70 个并行插槽的静态检查通过；113 张表的 DDL/Prisma 保持一致。
浏览器检查采用上述代表页，未将其表述为所有页面、权限组合和操作分支的逐项验收。
本地已更新；发布需先应用 0112 增量，本轮未上线。
