# 60-operations - Runbooks, audits, tech debt, incidents

Operational material for this repo: runbooks (`RUN-*`), audits, the tech-debt
register (`TD-NNN`), and incident notes.

## Tech-debt register (TD-NNN)

Append-only. Each entry is a known, deliberately-deferred debt with a stable ID
(never reused).

| ID | Title | Opened | Status |
|----|-------|--------|--------|
| TD-001 | 域业务规则尚无实现，仅有文档口径 | 2026-08-12 | closed 2026-08-15 |
| TD-002 | 产品界面文案违反 source ASCII-only 规则 | 2026-08-15 | open |
| TD-003 | 逾期承诺扫描的读后写竞态，缺一条部分唯一索引 | 2026-08-17 | open |
| TD-004 | 能力依赖用浮动别名 `stable`，不钉版本、不收弃用信号（L1 规范 X-4） | 2026-08-17 | open |
| TD-005 | 登录页的环境背景无 DS 元素可用，本地实现为权宜 | 2026-08-17 | open |
| TD-006 | DS 无计数徽标元素，助手入口的待办数用 destructive Badge 顶替 | 2026-08-24 | open |
| TD-007 | DS 无正文行宽（measure）token，八处判断文案手写 `max-w-[62ch]` | 2026-08-24 | open |
| TD-008 | DS 无任何数据可视化元素，战况板的图表本地实现 | 2026-08-24 | open |
| TD-009 | DS 无环形进度元素，信号评分环本地实现 | 2026-08-25 | open |
| TD-010 | 规则层的英文理由串直接当界面文案外泄 | 2026-08-25 | open |
| TD-011 | /account/[id] 的 key 警告：误判为 DS 缺陷，实为本仓 DecisionChain 缺 key | 2026-08-25 | closed 2026-08-25 |
| TD-012 | npm 侧 Dependabot 自建仓起从未成功，且 `audit` 只在推送时跑 | 2026-08-27 | open（洞二已修，洞一等 owner 配密钥） |
| TD-013 | `new_logo` 是计数指标，却用 `Money` 承载，表单让人用货币填一个数量 | 2026-08-27 | **closed 2026-08-28** |
| TD-014 | 快照记录了它服务的周期，却从不按周期过滤——`closed_amount` 是全部历史赢单 | 2026-08-28 | **closed 2026-08-28** |

Note: the template's own TD-001 / TD-002 (the `@vxture/shared` value-domain
dependency and the vendored health-identity deviation) were both closed upstream
on 2026-07-21 before this repo was instantiated. Their fixes are inherited in the
code; their register entries belong to the template's history and are not carried
here. This register restarts its numbering for `yucer`.

### TD-001 - 域业务规则尚无实现，仅有文档口径

批次 1 交付了产品域的**结构**：数据模型、能力矩阵、角色权限目录、业务规则文档。
但 `docs/20-specs/30-business-rules.md` 里的口径目前**只存在于文档和 DB 约束中**，
没有对应的应用层实现与单元测试。

具体缺口：

- **阶段机**：阶段流转必须写 `opportunity_stage_event`、进入终态必须置 `closed_at`
  并产生复盘——目前由文档约定，无代码强制。DB 层只挡住了空事件
  （`chk_opportunity_stage_event_move`）。
- **归因计算**：三级优先级取值规则无实现。归因键的不可变性已由列级写锁强制，但
  「创建时算什么值」还没有权威实现。
- **预测汇总与达成度**：`forecast_snapshot` 的生成逻辑无实现。
- **健康度派生**：`account.health_score` 的输入与算法无实现。

**风险**：在实现落地前，任何直接写库的路径都可能绕过这些口径。缓解措施是列级写锁
已经封死了最危险的一类（篡改证据与归因），但阶段机这类**流程性**规则数据库挡不住。

**偿还条件**：批次 2b —— 把这些规则实现为 `domains/<d>/lib/` 下的纯函数并配单测，
所有域写路径必须经过它们。见 `docs/70-workplan/00-index.md`。

**已关闭 2026-08-15**（PR #6）。四条缺口逐条落地为纯函数并配单测：

| 缺口 | 实现 |
|------|------|
| 阶段机 | `domains/pipeline/lib/stage.ts` —— 补丁与日志由 `planStageChange()` 一起产出，服务层在同一事务里写 |
| 归因计算 | `domains/pipeline/lib/attribution.ts` —— 三级优先级，创建时算一次 |
| 预测汇总与达成度 | `domains/pipeline/lib/forecast.ts` |
| 健康度派生 | `domains/account/lib/health.ts` —— 附带各因子贡献值，可解释 |

原风险陈述是「任何直接写库的路径都可能绕过这些口径」。现在 D6/D8 的写路径经
`domains/*/service.ts` 强制走规则；D1/D2/D3/D4/D7 **尚无任何写路径**，因此无可绕过。
这五个域的服务与持久化属于**未建功能**，跟踪在 `docs/70-workplan/00-index.md` 批次 2c，
不再计为技术债——未实现的功能不是债。

### TD-005 - 登录页的环境背景无 DS 元素可用，本地实现为权宜

**缺失的元素**：设计系统没有「环境背景」这类元素——铺满视口、承载产品气质、不携带
任何信息的装饰层。同时 `@vxture/design-system/styles/auth.css` **已退役**，其文件头
写明「原 8 个 auth-* 模块整体引用遗留 token，随其一并退役；认证页样式在 accounts
收敛时以工具类重建」。也就是说认证形态的样式当前处于收敛中间态，没有可组合的成品。

**权宜位置**：`portals/app/app/(app)/components/sign-in.tsx` 的 `Ambience()`。

**为什么不算违规的自建组件**：它不复刻、不覆写、不 fork 任何 DS 元素，颜色全部取自
DS token（`text-primary` / `var(--background)`），本地不定义任何色值。设计稿里的
`#2563eb` 与 `#cbdff5` **没有被搬进来**——若照抄，这个产品就把一套调色板钉死在自己
仓里，既不跟随品牌也不跟随主题。

**已知缺口**：设计稿中线条有 18s 漂移动效，本实现是**静态**的。Tailwind 的
`animate-[drift_...]` 需要一条本仓自定义的 `@keyframes`，那是在产品仓里发明动效设计值；
DS 目前只提供 `vx-boot-splash-in` 一条 keyframe，且无任何 `--animate-*` token。
因此动效一并挂在本条债上，而不是偷偷落地。

**为什么不用 `UnifiedAuthPage`**：那是**平台**认证页——桌面端强制渲染营销视觉栏
（`AuthVisualPanel` 在 visual 缺省时填 DS 默认文案），且其存在意义是承载密码 / 手机号 /
社交登录面板。本产品不实现任何一种登录方式，认证是平台的职责，本页全部内容只是一个
按钮。套用该模板等于承诺一个并不存在的登录表单。

**恢复条件**：DS 提供环境背景元素（或 accounts 收敛后重建的认证页样式）时，删除
`Ambience()` 改为消费 DS 元素，并在同一次改动中恢复漂移动效。

### TD-006 - DS 无计数徽标元素，助手入口的待办数用 destructive Badge 顶替

**缺失的元素**：设计系统没有「计数徽标」——挂在图标按钮角上、只承载一个数字、
用高对比实底把"有事等你"从一屏信息里拔出来的那种小气泡。DS 有 `Badge` 与
`StatusBadge`，但两者都是**行内状态标签**，为成簇并排而设计。

**权宜位置**：`portals/app/app/(app)/components/agent-dock-button.tsx`，
右翼收起时 header 上助手图标的角标。

**owner 要求的是实底红**。DS 明确拒绝提供，而且理由写在 `badgeVariants` 的注释里：
destructive 档取 `bg-destructive-muted`（淡底）而非实心红，因为「徽章常成片出现，
满屏实心红会把整页的视觉重心压到异常状态上」。那条判断对**行内状态标签**是对的；
对**角标计数**不成立——角标一屏只有一两个，它存在的全部意义就是打断视线。
两种用途共用一个元素，所以这个分歧现在没有出口。

**为什么不本地覆写**：把 `bg-destructive` 写在调用点上，就是在产品仓里就地重定义
DS 元素的表面色，正是 CLAUDE.md 刚性区禁止的那种偏离。角标的尺寸同理：
`Badge` 定高 `h-control-2xs` + `px-sm`，单个数字渲染成 30x20，比它挂着的 32px
按钮还宽——但那个定高在 DS 里也是有理由的（成簇时要对齐），不该由消费方改掉。

**当前表现**：淡红底、红字、红描边的 `Badge variant="destructive"`，尺寸偏大。
可读、语义正确、但不是被要求的那枚实底小气泡。

**恢复条件**：向 DS 提出计数徽标元素（实底、圆形或胶囊、随图标按钮尺寸档走、
带 99+ 溢出规则）。DS 提供后，删除本地组合，改为消费该元素。

### TD-007 - DS 无正文行宽（measure）token，八处手写 `62ch`

**缺失的元素**：设计系统没有「行宽」token —— 一行正文最多允许多宽。DS 的
`--container-content-narrow-lg`(64rem) / `--container-base-xl`(80rem) 是**版面宽度**，
量的是栏能有多宽；行宽量的是**一行字读起来会不会串行**，两者语义不同，
数值也差一个量级（62ch 约 31rem，narrow-lg 是 64rem）。拿版面宽度当行宽用，
判断正文会拉到 1024px 一行，正是这个 token 要防的事。

**权宜位置**：8 处 `max-w-[62ch]`，分布在
`judgement-workspace.tsx`(3) / `position-brief.tsx`(4) / `signal-queue.tsx`(1)。

**为什么值得要一个 token**：行宽是**排版常量**，不是每个页面各自的选择。现在
8 处都写着 62ch，靠的是抄；下一个人写 68 或 72 不会有任何东西拦他，而串行的
那一屏没人会归因到这里。它和字号档一样属于 T1 排版层 —— DS 已经管了字号、
行高、字距，唯独漏了行宽，而行宽是这四项里唯一与「读得下去」直接相关的。

**为什么不在本仓自造 token**：CLAUDE.md 刚性区规定排版取值属于 DS。产品仓自造
`--yucer-measure` 会让五个门户各有一份行宽，正是 DS 存在的理由所要消除的分叉。

**当前表现**：功能正确，8 处数值一致，但没有任何机制保证第 9 处也是 62ch。

**恢复条件**：向 DS 提出 measure token（建议 `--container-measure` 或
`--spacing-measure`，取值随字号档走）。DS 提供后，8 处替换为该 token 类名。

**2026-08-25 补记 - Tailwind 自带的 `max-w-{档}` 在本应用里是死的。**
DS 把容器刻度发布为 `--vx-container-*`，**没有**同时别名 Tailwind 的
`--container-*`。于是 `max-w-2xl` 生成 `max-width: var(--container-2xl)`，
而该变量为空 —— 实测宽度塌到 40px，八个汉字折成三行。
**正确写法是直接点名 DS token**：`max-w-(--vx-container-2xl)`（实测 672px）。
信号行的项目概要已按此写。这七处 `62ch` 也可以据此收编 ——
`--vx-container-*` 是 rem 刻度不是 ch 刻度，不等于正文行宽 token，
所以本条债不因此关闭，但修的时候不该再写方括号任意值。

### TD-008 - DS 无任何数据可视化元素，战况板图表本地实现

**缺失的元素**：设计系统**一件图表都没有**。`MetricCard` / `MetricGrid` /
`PanelItem` / `FactList` / `LabeledValue` 全部是文字读数；`Progress` 只画一个比例，
且只有一条轨。占比条、条形列表、迷你趋势线一件都没有，无从组合。

**权宜位置**：`portals/app/app/(app)/components/board-chart.tsx`
（`ShareBar` 占比条 / `BarList` 条形列表），由左翼六张卡消费。
**同一条债还覆盖两处更早的手写图表**（随 PR #56 进入，此前未登记）：
`forecast-trajectory.tsx` 的预测柱状图、`judgement-workspace.tsx` 的覆盖率迷你柱。

**为什么不算违规的自建组件**：
· 颜色全部是 DS 语义槽（`primary` / `destructive` / `warning` / `success` / `muted`），
  不定义任何色值，不引入任何调色板条目；
· 间距、圆角、字号全部走 DS token；
· **唯一的计算值是百分比宽度，而那就是数据本身** —— 没有类名能表达连续值，
  硬造一套宽度档反而是在发明尺度。

**分类色是这条债的核心**：无语气的分段（"停滞风险 / 决策链测绘 / 信号分拣" ——
是种类不是好坏）需要彼此可辨。本地实现用**单色阶**（`bg-primary` →
`/70` → `/45` → `/25`）而**不是四个色相**：挑四个可辨的色相就是在设计分类色阶，
而颜色归 DS。单色阶同时也是更诚实的读法 —— 四个颜色会暗示四种含义，
而数据里没有。**修之前所有无语气分段都渲染成同一个 `bg-primary`，
三段的条看起来是一整块，图表的全部内容（怎么分的）不可见。**

**图形选择不在组件里**：`BoardSection.chart` 由 `board.ts` 声明
（`"share"` = 这些数分割同一个总体；`"bars"` = 各自独立、同一单位）。
把互不相关的数画成一条占比条，是在断言一个并不存在的关系，
而组件没有办法知道 —— 这个判断属于取数那一层。

**恢复条件**：向 DS 提出数据可视化族（至少：占比条、条形列表、迷你趋势线，
外加一套分类色阶）。DS 提供后删除本地实现，三处消费点改为消费 DS 元素。

### TD-009 - DS 无环形进度元素，信号评分环本地实现

**缺失的元素**：环形／圆形进度。核对 `@vxture/design-ui@3.0.0` 的完整导出表，
进度一族只有 `Progress` 一件，且是线性的 shadcn 条（`bg-accent` 轨道 +
translateX 填充）。donut / circular / radial / ring 一件都没有，
`@vxture/design-system` 同样没有。无从组合。

**权宜位置**：`portals/app/app/(app)/components/score-ring.tsx`，
由 `signal-queue.tsx` 的行首消费。

**为什么不算违规的自建组件**：它**不替换任何 DS 元素** ——
不覆写任何 DS 类名，不遮蔽任何 DS 导出。颜色全部经 `currentColor`
取 DS 语义槽（`success` / `info` / `warning` / `destructive` / `muted-foreground`），
不定义任何色值。尺寸对齐 `PanelItem` 的前导轨 `w-control-md`（32px）。

**为什么需要环而不是数字**：裸数字要求读者在脑子里持有量表 —— 62 算高还是低？
环把量表画出来，所以结论在读到数字之前就已经可读，这正是分拣队列要的。

**顺带修掉的一个真错**：旧代码手工映射色调并判断
`confidenceTone(...) === "danger"`，而 `confidenceTone` **从不返回 danger**，
于是 info 档穿透到 success 的绿色 —— 65 分和 85 分画成同一个绿。
现在色弧与"推荐程度"徽标同出 `confidenceTone`，两者不可能不一致。

**已知限制**：前导轨宽 32px 是 DS 写死的，环心两位数字只能到 `text-label-sm`。
若判定过小，正确的解法是向 DS 提（加宽前导轨或直接出评分环），
不是在本地覆盖那个类名。

**恢复条件**：DS 提供环形进度（带语义色档与环心插槽）。提供后**删除**本文件，
而不是改造它。

### TD-010 - 规则层的英文理由串直接当界面文案外泄

**症状**：`/delivery` 的「已下调」提示框整条内容是
`1 overdue instalment(s): a project with unpaid instalments cannot be green`
—— 一句英文散文，出现在一个全中文的产品里，而且是提示框的**全部**内容。

**根因是 TD-002 的镜像。** TD-002 说的是中文漏进了要求 ASCII 的 source；这一条说
的是**英文从 source 漏进了界面**。`domains/delivery/lib/revenue.ts:178` 的
`deriveProjectHealth` 直接把理由拼成一句英文散文放进 `overriddenBecause`，而它所在
的文件必须 ASCII-only，所以那句话**永远不可能**是产品文案。

**当前处置（权宜）**：提示框改为「中文规则句 + 机器判定依据」两行，把那句英文降级为
**证据**而不是文案。降级是诚实的 —— 它本来就是规则层的自述，不是写给用户看的话。

**正确的修法**：规则返回**结构化理由**（`{ code: "overdue_instalment", count: 1 }`）
而不是散文，由界面层渲染。牵动 `revenue.ts` / `service.ts` 与两处断言
`/cannot be green/` 的测试（`revenue.test.ts:157`、`service.test.ts:84`），属于
域服务层改动，不在页面重构范围内。

**同类风险**：`deriveProjectHealth` 里还有第二句
`${missed} missed milestone(s)`，同一路径同一问题。改结构化理由时一并处理。

**恢复条件**：规则层改为结构化理由，界面层删除本条的权宜渲染。

### TD-011 - `/account/[id]` 的 key 警告 —— 一次把根因推给上游的误判

**已关闭 2026-08-25。修复在本仓，两行。**

**症状**：`/account/[id]` 开发期报
`Each child in a list should have a unique "key" prop. Check the render method
of 'Section'. It was passed a child from AccountDetailPage.`
指认的「孩子」是页面里的 `<LinkContacts>` —— 一个作为 prop 传给 `DecisionChain`、
再由它放进 `Section` 的元素。

**警告本身指不出正确的位置。** 它报出两个组件：接住 children 的那个（`Section`）
和创建元素的那个（`AccountDetailPage`）。真正**把 children 拼成数组**的那一层
（`DecisionChain`）一个字都没被提到。本条最初据此把根因写成 DS 的
`Section` 用了 `jsx` 而非 `jsxs`，并断言「24 个组件文件全部命中」。**这是错的。**

**证伪（消费端做的对照组）**：

| 对照组 | 结果 |
|--------|------|
| 静态多孩子 → `Section` | 不报警 |
| 中间层拼数组 → `Section` | 报警 |
| 中间层拼数组 → 裸 `<div>` | **同样报警**，DS 不在链路里 |
| 中间层改用带 key 的 Fragment → `Section` | 不报警 |

第三组决定了结论：换掉 DS 组件，警告原样出现。所谓「一行修复」也不存在 ——
DS 源码写的是 `{children}`，`jsx` 与 `jsxs` 由编译器按调用点的字面孩子选择，
不是 DS 能改的一个字符。

**真实根因**：`DecisionChain` 的 `Section` 有六个孩子，其中五个写在本文件里，
第六个 `linkForm` 是页面创建后传进来的。缺 key 的是这一个，而 `DecisionChain`
是唯一有资格给它 key 的地方。

**修法**（`portals/app/app/(app)/components/decision-chain.tsx`，两处返回各一行）：

```tsx
{linkForm ? <Fragment key="link-form">{linkForm}</Fragment> : null}
```

**为什么不能压**：`Section` 里紧挨着的四个兄弟都是条件渲染。少一个，后面的就落进
更早的下标，React 按下标复用实例，state 会串到另一个兄弟身上。实测：改动前
A:0 / B:3，A 消失后 B:0 —— B 的状态被 A 的实例带走了。稳定 key 挡的是这个；
控制台安静只是副作用。`Children.toArray`、外包一层 `<div>`、以及本条原先写的
「24 个文件各包一层」的绕法，都是把这个缺陷藏起来。

**留下的规矩**（比这条债本身更值钱）：**说「根因在上游」之前，先造一个不含上游的
对照组。** 本条的原始版本从产物（编译后的 `jsx(...)` 调用）反推机制，没有做这一步，
于是把自己的缺陷写成了别人的。DS 侧已把同一条判据写进 `docs/070-audit-playbook.md`
§1.4，并在 PR #21 里让 key 警告直接判测试失败。

### TD-002 - 产品界面文案违反 source ASCII-only 规则

`CLAUDE.md`「Repository hygiene」要求 source 文件 ASCII-only。下列文件**违反这一条**，
它们包含中文文本：

| 文件 | 内容 | 加入时间 |
|------|------|----------|
| `portals/app/app/(app)/lib/messages.ts` | 全部界面文案 | 2026-08-15 |
| `portals/app/app/domains/shared/demo-fixtures.ts` | 演示数据的展示文本（客户名、商机名、剧本正文） | 2026-08-15 |
| `portals/app/app/domains/judgement/lib/judgement.ts` | 判断句、事实标签与触发条件的中文表述 | 2026-08-17 |

**为什么存在**：yucer 的主市场是中国企业销售组织（`brand.ts` 的
`defaultLocale: "zh-CN"`，全部产品规格以中文撰写）。界面文案不可能既是 ASCII 又是
这个产品该有的样子。演示数据同理：一份用拼音或英文假名填充的销售数据，无法向目标
用户演示这个产品，也无法被评审。

**2026-08-17 新增第三个文件。** `judgement.ts` 生成判断句本身（"华东零售集团在 negotiate
阶段停了 50 天"），这些句子由规则内插数值构成，不是可查表的静态文案，因此没有随
`messages.ts` 一起外提。它与前两个文件不同：**它含逻辑**，所以此前"两个文件都只含数据"
的收敛论证对它不成立。这一条是本仓自己引入的，不是模板遗留，登记于此以免它被当成
既有状态默认接受。

**已做的收敛**：非 ASCII 文本集中在这**三个**文件里，前两个只含数据、不含逻辑。
因此：

- `app/` 下含非 ASCII 的 source 文件**可穷举**，可用一行命令机器校验；
- 规则层、门控层、客户端、组件、视图映射、演示数据的**装配逻辑**全部保持 ASCII
  （`demo-seed.ts` 只引用 `demo-fixtures.ts` 的导出，自身不含中文）；
- 将来替换只是换一处 import，不需要重写组件或重写种子数据的结构。

**为什么没有就地"修掉"**：可以把文案改成 JSON + `\uXXXX` 转义，那样 100% ASCII 且
仍渲染中文——但那份文案将无法被人类阅读和维护。用一份不可维护的文案换一条规则的
字面满足，是更差的结果。

**偿还条件**（二选一，都不在本仓单方面决定）：

1. 平台仓修订标准，为面向终端用户的文案显式开一个口子，本仓随后镜像；
2. 引入正式 i18n 方案，文案移出 source 树（例如运行时加载的 locale 资源）。

`CLAUDE.md` 明确规定「标准的缺口先在平台仓修，不得在产品仓内自造标准」，所以这里
**只登记，不裁定**。在裁定之前，收敛状态维持不变：新增中文文本只能进入上表已列出的
文件，不得散落到第三处。

**2026-08-26 补记 —— 收敛更紧了一格，债本身没变。**

这一天把 16 个组件从「直接 import `messages.ts`」改成走字典
（`useMessages()` / `getMessages()`），并把 `lib/ds-labels.ts`（传给 DS 的那组
文案：`取消` / `更多操作` / `重置筛选` / `已选择 {count} {noun}`）整组并入
`messages.ts`，原文件删除。于是含中文的 source 文件从**四个回到三个**，上表不变。

顺带修掉的是一个此前看不见的缺陷：`ds-labels.ts` 和那 16 个组件用的都是
**模块级常量**。模块级常量在 import 时求值，等于把第一个加载的语言冻住发给之后
所有读者——所以在字典里补英文是不生效的，详情页无论如何都是中文。**接线是一半，
翻译是另一半**，此前只做了后一半。

覆盖率现在可机器校验，两条 grep：

```
grep -c "^export \(const\|function\) " messages.ts      # 分母 67
grep -c "^  [A-Za-z_]*: [{([]"          messages.en.ts    # 分子 65
```

差的两条是 `PREVIEW_FIXTURES` / `PREVIEW_TEXT`，属于 `/product-preview`——按构造钉
在 zh-CN 的夹具页，是演示数据不是产品文案，不计入。

**本条债不因此关闭**：两份字典仍在 source 树里，偿还条件（平台仓开口子，或文案移出
source 树）一条都没满足。变的只是收敛质量——中文的落点更少、更可数。


### TD-003 - 逾期承诺扫描的读后写竞态

`runCommitmentSweep` 先读「已在队列中待裁决」的提案做去重，再写新提案。中间没有事务、
没有锁，数据库也没有约束能兜底——`yucer_agent.agent_action` 上只有两条非唯一索引。

**表现**：两次并发扫描各自读到空的待裁决集合，双双建单。两条逾期承诺变成四条提案，
而**两份账目都报 `{overdue:2, proposed:2, alreadyQueued:0}`**，看起来都很干净。
这是这次自审里唯一一条「两边都不报错」的缺陷。

**修法**：一条部分唯一索引，写成增量：

```sql
CREATE UNIQUE INDEX uidx_agent_action_sweep_open
  ON yucer_agent.agent_action (workspace_id, action_type, (payload->>'commitmentId'))
  WHERE action_type = 'chase_overdue_commitment' AND status = 'proposed';
```

`WHERE status = 'proposed'` 这一半是关键：**全量唯一索引会让人工拒绝之后再也无法就
同一条承诺重新提案**，而那正是这个作业最该做的事——承诺还欠着，就该再问一次。
插入时把唯一冲突映射成 `alreadyQueued`。

**为什么当前可以先记不修**：定时器在平台侧且唯一，暴露面是运维手动重复触发，不是
系统自己制造的竞态。**不用应用层加锁顶替**——两个副本下那个锁是错的，会给出一种
已经解决了的错觉。


### TD-004 - 能力依赖不钉版本，也收不到弃用信号

`product_251` X-4：「消费方依赖的每个对象（能力、模型、工具）**MUST** 可钉版本并能
被告知弃用。」

本仓 `RunosClient.resolve()` 与 `SkillLoader.load()` 全部落在默认值 `"stable"` 上，
而 `stable` 是**浮动别名**。`types.ts` 声明了 `version_resolved`，没有任何调用点读它；
Runos 提供的 `deprecated` 生命周期字段本仓一处都没声明。

**后果**：运营者把 `stable` 改指到另一个版本时，本仓行为随之改变——**没有代码变更、
没有信号、没有测试变红**。表现是「同样的问题昨天好好的今天不对了」，且无从归因。

顺带记一条**平台侧的债，不是本仓的**：Atlas 的模型面**根本没有版本列**，只有
`model_code` / `is_active`。供应商在同一个 `model_code` 背后换模型行为是常态，而消费方
拿不到任何信号——没有版本可钉、没有弃用期、没有别名可切。本仓按 `endpointCode` 路由
买到的是运营者的间接层，**不是**变更通知。

**修法**（本仓这一半）：`resolve()` 钉解析后的 semver 并读回 `version_resolved`；
声明 `deprecated` 并在解析到已弃用能力时记录；`latest` 加警告——它可能**回拨**
（先注册 2.0.0 后补 1.0.1，Runos 侧语义未裁定）。

### TD-012 - 两张 SCA 的网同时是破的，而它们本该互补

2026-08-27 合并 PR #62 后清点告警时发现。Dependabot 告警 #1
（`deepmerge-ts < 8.0.0`，high，GHSA-ggr8-5vv4-36mx，栈耗尽）于 2026-08-17T14:54Z
建立，而 `main` 一直停在 `3138c04` 带着 `deepmerge-ts@7.1.5`，**十天无人处置**。

它最后是被**顺手**修掉的：有人在做别的事时加了一条 pnpm override，随 PR #62 一起进
`main`（`7.1.5 -> 8.0.1`）。**没有任何机制促成这件事**——这才是要记的部分。

两个洞各自独立，合起来正好把两张网都撤了。

**洞一：npm 侧 Dependabot 从来没成功过。** 证据是运行
[32564752124](https://github.com/vxture/vx-agent-yucer/actions/runs/32564752124)：
每一个依赖都以 `private_source_authentication_failure {source: "npm.pkg.github.com"}`
失败（`pg` / `tsx` / `jose` / `ioredis` / `react` / `typescript` / `@prisma/*` 全部）。

版本探测那一步是**成功**的，`@vxture/*` 的 ignore 也按设计生效。失败发生在
`corepack pnpm update <pkg> --lockfile-only`：pnpm 要重解析整个工作区，其中包含
从 GitHub Packages 取的 `@vxture/*`，而 Dependabot 环境里没有那个 registry 的凭据——
`.github/dependabot.yml` 没有 `registries:` 块。**把 `@vxture/*` 从更新里 ignore 掉，
并不能让解析器不需要它**，这是这条 bug 唯一反直觉的地方。

旁证够硬：本仓迄今产生过的 Dependabot PR 共 9 条（#1-#5、#58-#61），
**全部是 `github-actions` 生态**。npm 那一半产出为零。

**洞二：`audit` 只在代码移动时跑。** `ci.yml` 的触发器是 `pull_request` 加
`push: main`，**没有 `schedule:`**。`3138c04` 上最后一次 ci 跑在 2026-08-17T13:16Z，
而该条公告 14:54Z 才落库——晚了 1 小时 38 分。osv-scanner 当时并没有漏报，它只是
**再也没有跑过**。一条针对**未变动**的 lockfile 新增的公告，在静止的主干上直到下一次
推送为止都是不可见的。

两张网的分工本来是清楚的：`audit` 是**硬门禁**，管「这次改动别引进新洞」；Dependabot
是**连续监视**，管「已经躺在那儿的洞有人盯」。第一张网按设计就不看静止的主干，第二张
网坏了，于是没有任何东西在看。

**为什么不在本仓修。** 两处修法都在模板层：`dependabot.yml` 与工作流触发器语义都是
从 `vxture-template` 原样继承的，而**任何消费 `@vxture/*` 的产品仓都有同一个洞**——
这不是 yucer 的产品决定。按 `CLAUDE.md`：标准缺口先在平台仓修，再镜像回来，不得在
产品仓自造标准。工作流触发器语义另外还明确落在刚性区里。

**修法**（平台仓，`vxture-template`）：

```yaml
# .github/dependabot.yml
registries:
  vxture-github-packages:
    type: npm-registry
    url: https://npm.pkg.github.com
    token: ${{secrets.DEPENDABOT_PACKAGES_TOKEN}}

updates:
  - package-ecosystem: npm
    directory: /
    registries:
      - vxture-github-packages
```

外加给 `audit` 一个定时触发（`ci.yml` 加 `schedule:`，或单独一条只跑 osv-scanner 的
定时工作流），让 SCA 门禁在静止主干上仍然复扫。

**这条有一个本仓改不动的前置**：`DEPENDABOT_PACKAGES_TOKEN` 需要一个带 `read:packages`
的 PAT，配成 org 或仓库级的 **Dependabot secret**（注意不是 Actions secret，两者是
分开的命名空间）。铸 token 是 owner 动作。

**关闭条件**：模板修好并镜像回本仓后，npm 生态产出第一条 Dependabot PR；且能演示
一次「静止主干上新公告触发 `audit` 变红」。在那之前，本仓的 SCA 姿态实际是
「只在有人推代码时检查」，不要按「连续监视」来读。

**补记（2026-08-28，收尾清理未合并 PR 时发现）**：这条公告其实**是**被报出来过的，
而且是四次。#58-#61 四条 Dependabot PR 全部开于 2026-08-22，四条的 `audit`
**全部红**，红的原因逐字就是这一条：

```
| https://osv.dev/GHSA-ggr8-5vv4-36mx | 8.2 | npm | deepmerge-ts | 7.1.5 | 8.0.0 | pnpm-lock.yaml |
```

所以准确的说法不是「没有任何东西在看」，是**看到了、喊了四遍、没人听见**——
因为信号出现的地方是「Dependabot PR 红了」,而那句话读起来像**那条 PR** 有问题，
不像**主干**有一个 high 公告。四条一起红本该是这个误读的解药，结果只是让它更容易
被当成 Dependabot 自己的老毛病而整批忽略。

**这给关闭条件加了一条**：定时 `audit` 的价值不只是「跑到」,是把结论放在**主干**
名下。一条挂在别人 PR 上的红叉，不是主干的健康报告。

**再补一记（2026-08-28，同一次清理）**：这个洞是**双向**的，上面只写了一半。

`main` 的 lockfile 现在只有 `deepmerge-ts@8.0.1`,漏洞版本一行不剩，osv-scanner 连
过七次。而 **Dependabot 告警 #1 仍然是 `open`**——并且：

```
created_at: 2026-08-17T14:54:15Z
updated_at: 2026-08-17T14:54:15Z     <- 同一秒，从未再动过
fixed_at:   null
```

修复落地之后主干推送了七次（#62 / #64 / #63 / #58-#61）,**它一次都没有被重新评估**。
原因和洞一是同一个：npm 侧解析不了这个 workspace，所以 Dependabot 既**看不见新漏洞
进来**，也**看不见旧漏洞离开**。

于是本仓唯一一条打开的高危告警，指的是一个**已经不存在的漏洞**。这比漏报更难处理：
漏报是「列表是空的」,而这个是「列表上有一条，是假的」——下一个人照着它去修，会发现
无处可修，然后学会不相信这张列表。**一张会撒两种谎的告警列表，比没有列表更贵**,
和 TD-011 记的是同一件事的另一面。

TD-012 原文说这条公告是「被顺手修掉的」。准确的说法是：**漏洞被顺手修掉了，告警没有。**

**不在此处手工 dismiss。** 手工关掉它就抹掉了这个洞现在唯一看得见的证据，而
`state: open` + `updated_at` 十一天没动，恰恰是模板修好之后用来验证「Dependabot
重新开始评估本仓」的那个观测点。**要 dismiss 是 owner 的动作，而且应该在模板修好
之后做，不是之前。**

**关闭条件因此再加一条**：模板修好后，告警 #1 应当由 Dependabot **自己**转成
`fixed`（`auto_dismissed_at` 或 `fixed_at` 非空）。它自己关掉这一条，才证明这只眼睛
真的睁开了；由人关掉只证明有人点了按钮。

---

### TD-012 的修复进度（2026-08-28）

按 `CLAUDE.md` 先在模板仓修：**vxtpl#59**,再镜像到本仓。两个洞的进度不同，
分开记，因为「PR 合了」不等于「洞堵上了」。

| 洞 | 状态 | 卡在哪里 |
|----|------|---------|
| 洞二：`audit` 看不见静止主干 | **已修**,不需要任何密钥 | 无 |
| 洞一：npm 侧 Dependabot 认证失败 | 配置已落，**未生效** | 等 owner 铸 token |

**洞二的修法是 `sca-watch.yml`**：每日 cron + 手动触发，对 `main` 当前状态跑
osv-scanner。两个决定值得写下来：

- **它开 issue,不只是把 job 跑红。** 本条 TD 补记的那件事就是证据：门**响过**,
  四条 PR 一起红，读起来却像「那几条 PR 坏了」。结论必须落在**追踪主干问题的地方**,
  否则它不是报告，是一行日志。
- **它在主干重新干净时把 issue 关掉。** 一个能拉警报却不能撤警报的看门狗，
  产出的是一张带假条目的清单，而带假条目的清单会教人不再读清单——本条 TD 上面
  记的告警 #1，正是这个形状。

**新守卫 `check-sca-consistency.mjs`**：把一次扫描拆成两份，买到了覆盖，也造出一种
新的错法——两份会漂移。它断言四件事：同一个 `OSV_SCANNER_VERSION`、同一个
`sha256`（版本不是制品，sha 才让钉版本有意义）、同一串参数（漏掉 `--config` 会让
watch 悄悄不再应用 ignore 基线）、以及 watch 里**不得有任何 job 名撞上五个必需检查
上下文**。五条失败路径逐条反证过，包括 watch 文件整个不存在那条。

**洞一还差一个 owner 动作**：`VXTURE_PACKAGES_READ_TOKEN`,只带 `read:packages` 的
**classic** PAT（GitHub Packages 的 npm registry 不收 fine-grained token）,配成
**Dependabot** 密钥——不是 Actions 密钥，两者互相看不见，这正是本仓已有的
`NODE_AUTH_TOKEN` 帮不上忙的原因。

配好之后**要验，不要假设**：在 Insights -> Dependency graph -> Dependabot 上对 npm
那一项点 "Check for updates",确认 job 日志里没有 `ERR_PNPM_FETCH_401`。
**「配了应该就好了」正是这个洞活到今天的原因**——它从来不报错，它只是不产出。

#### 洞二的修复是**验过**的，不是部署过的（2026-08-28）

这一整轮反复出现的教训是「一个从未失败过的守卫，说不出自己能不能失败」。
新看门狗自己也适用，所以它上线后立刻在一条一次性分支上被**故意触发**过一遍——
把 `pnpm-lock.yaml` 里的 `deepmerge-ts` 文本改回 7.1.5（osv-scanner 只读锁文件，
不安装，所以这就够了）。`main` 全程未受影响。

| 主干状态 | run | 结果 |
|---------|-----|------|
| 干净 | [33148562013](https://github.com/vxture/vx-agent-yucer/actions/runs/33148562013) | 成功，不开 issue |
| 带漏洞 | [33148627015](https://github.com/vxture/vx-agent-yucer/actions/runs/33148627015) | 失败，**开出 issue #67** |
| 恢复干净 | [33148664485](https://github.com/vxture/vx-agent-yucer/actions/runs/33148664485) | 成功，**自动关掉 #67** |

**第三行才是这次最要紧的证据。** 本条 TD 上面记的告警 #1，症结正是「能报不能撤」;
一个只验证了报警路径的看门狗，会长成同一个形状。三行都跑过，才叫这个循环是闭的。

一次性分支 `test/sca-watch-selftest` 已删除，#67 已关闭并在评论里写明它是自测。

### TD-013 - 计数指标装在货币类型里

**缺陷**：`TARGET_METRICS` 有四个值——`revenue` / `new_logo` / `pipeline` /
`margin`，而 `SalesTarget.targetAmount` 只有一个类型 `Money`，携带 `currency`。
`new_logo`（新客户数）是**计数**：十个新客户不是十块钱，也没有币种。

**表现**：`/planning` 的建立目标表单在指标选到「新客户数」时，仍然要求填一个金额，
并把它按货币格式化显示回去。数据库侧 `sales_target` 同样存 `targetAmount + currency`，
所以一条计数目标在库里永远带着一个无意义的币种。

**不是本次引入**：6a-2 把表单接上时发现的既有建模缺口，当时记在
`docs/70-workplan/00-index.md` 的 6a-2 记录里。按 `CLAUDE.md`，技术债登记在本文件，
所以补这一条；工作计划里那段是发现经过，这一条是登记。

**为什么现在不改**：`targetAmount` 是 `sales_target` 的列，改它的形态要走
`db-init` 增量 + Prisma lockstep + 列锁三处联动，而 `attainment()` 有八个调用方
读它。这属于一次有范围的建模修正，不是接线批次里顺手能带的改动。

**修法**（择一，需要一次裁定）：把 `targetAmount` 拆成
`targetValue: number + unit`（`money` | `count`），由指标决定单位；或者把计数指标
移出 `sales_target`，承认它是另一张表。前者保住「一个目标一行」，后者承认两种目标
本来就不是一回事。

**恢复条件**：上述任一裁定落地，且表单不再对计数指标显示币种。

**已关闭 2026-08-28**（ADR-020）。取第一条修法：一张表，单位由指标推导，不存列。

查证时发现登记的这一条只是症状。真正的缺陷是**`metric` 从来没进入达成率计算**：四个
指标共用同一个分子（快照的 `closedAmount`，是金额）。实测一条「新客 10」的目标渲染成

```
| 全工作区 | 新客户数 | ¥10 | ¥2,700,000 | 27,000,000% | 草稿 |
```

——目标带着货币符号（登记的那一条），分子是已成交营收（没登记的那一条），商被当成
百分比展示。四个指标里三个的数是没有意义的。

| 修的东西 | 怎么修 |
|---------|--------|
| 单位 | `TargetValue` 判别联合（money \| count），`unitOf(metric)` 是纯函数。把计数格式化成货币现在编译不过 |
| 币种 | `sales_target.currency` 改为可空，加 CHECK 把它和 metric 绑死（incr/0013）。错误状态不可表示，不只是不鼓励 |
| 收入分子 | `closedAmount`，不变 |
| 管道分子 | 改用 `pipelineAmount`。用成交额去量一个建管道的目标，等于按「已经不再是管道的部分」给它打分 |
| 新客分子 | 快照新增 `new_logo_count`：本期首次赢单的客户数。全工作区判「首次」，再归给那一单所在的作用域——否则同一客户在两个区各算一次新客 |
| 毛利分子 | **没有**。成本尚未进入模型，界面报「需补充成本」（owner 2026-08-28：指标留下，说清缺什么），不再编一个数 |

`new_logo_count` 可空且无默认值。旧快照的 0 是假话：「没人数过」和「数出来是 0」不是
一回事，跟「没提交快照」不等于「达成 0%」是同一条道理。

顺带修好两处同型：战况板配额卡与 `/planning` 首行都用内联 `.find()` 取「第一条已承诺
的工作区目标」，不看指标，然后按货币格式化。提为规则层的 `summaryTarget()`，配单测。
当前数据的行序恰好让收入排在前面，所以它是潜伏而非已发作——把收入目标关掉就不是了。

（当时留下的不一致——新客计数按周期算而金额总额不按——已由 TD-014 于同日消除。）

### TD-014 - 快照按周期标注，却从不按周期过滤

**缺陷**：`planSnapshot` 收下 `period` 并写进行里，但喂给 `rollUp` 的机会列表**不按
周期过滤**。于是一条 2026Q3 的快照，`closed_amount` 是工作区**有史以来**的全部赢单，
`pipeline_amount` 包含预计在任何未来季度成交的机会。

**为什么现在才发现**：demo 数据里恰好只有本季赢单，两个数因此相等。TD-013 要给新客
计数做分子时必须先有「周期覆盖哪段日期」，`periodRange()` 就是那时写的——写完才看清
同一份快照里其他几个数从来没用过它。

**不是本次引入，也不在本次修**：TD-013 的范围是单位与分子选择。按周期过滤金额总额会
改变**当前屏幕上已有的数字**（首页配额卡、`/planning` 达成度、预测轨迹五个点），那是
一次独立的、需要单独验证的修正，塞进一个建模 PR 里不可复核。

**当前的不一致是显式的**：新客计数按周期算（它自身正确的定义），金额总额不按。登记在
这里，让它是有日期的已知项而不是藏起来的矛盾。

**恢复条件**：`planSnapshot` 按 `periodRange(period)` 过滤——成交额按 `closed_at`，
前瞻三档按 `expected_close_at`——且预测轨迹与配额卡的新数字经过实测确认。

**已关闭 2026-08-28**（ADR-021）。范围比登记时查到的更大：不止快照，**每一处标着周期
的汇总都没按周期过滤**。

| 界面 | 原来 | 现在 |
|------|------|------|
| `forecast_snapshot` | 标着 2026Q3，内容是全部历史 | 按周期过滤；解析不出的周期标签直接拒绝写入 |
| `/pipeline` 四个数据块 | 页面有周期选择器，但只有预测轨迹跟着变 | 整页跟着走：数据块、表格、轨迹 |
| 战况板「本季承诺」 | 全书在办 | 本季 |
| 战况板资源仪表 | 池子是全书在办，除数是本季缺口 | 池子也按本季，标签改为「本季资源储备」 |

`inPeriod()` 是 `inScope()` 的姊妹：**赢单按 `closed_at` 归期**（那是事实），
**在办按 `expected_close_at` 归期**（那是预测，也正是预测的全部内容）。

**没有预计成交时间的在办商机不属于任何周期**，被排除并单独计数（`undated`），页面把它
说出来。默认进当前周期等于替人做了一个承诺；静默丢弃则让总额小于它背后的列表而屏幕上
没有任何解释。

**实测**（demo，2026Q3）：

```
承诺 ¥420万 | 乐观 ¥95万 | 管道 ¥48万 | 已成交 ¥270万 | 共 7 条（原 12 条）
本季资源储备 563 万 / 覆盖 20%（原 881 万 / 32%）
预测轨迹末点与四个数据块逐项一致
```

切到 2026Q4 页签：`承诺 ¥0 | 乐观 ¥208万 | 管道 ¥110万 | 已成交 ¥0 | 共 4 条`。
选择器从此真的会移动整页。

**动过一处 demo 数据，明说**：`opp_demo_11` 的预计成交从 +75 天改到 +40 天。所有日期
都是在没人读它们的时候定的，过滤上线后三条管道类商机全在 Q4，管道数据块与管道指标会
永远显示零、无从演示。只移了一条；另外两条留在 Q4 并被可见地排除——那正是这次改动
要展示的行为。
