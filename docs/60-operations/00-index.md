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
