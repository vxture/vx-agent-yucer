# ADR-011 - arda 接在信号缝上：一期只取数、不外发、零 DDL

- 状态：已接受
- 日期：2026-08-16

## 背景

owner 于 2026-08-16 指示：由于各业务差异大，产品**可以自建数据库**，但**也需要对接
arda**，实现共享和数据获取。

本仓自建库这一半已经成立：**6 个产品 schema**（`yucer_core` / `yucer_gtm` /
`yucer_pipeline` / `yucer_delivery` / `yucer_agent` 五个来自批次 1，`yucer_field`
来自 ADR-006 的 `incr/0004`）加 3 个契约面 schema，共 37 张表，DDL 为权威、
Prisma lockstep 对账。
要裁定的是另一半——arda 以什么形态进来。

同时，工作计划里挂着一条未决事项：**「信号外部数据源的选型与合规边界未定，是批次 5
的前置；走 Runos connector 还是平台数据服务取决于运营侧注册了什么。」** owner 的指示
回答了它：走平台数据服务。

`signal.external_feed` 这个 feature key 已经在能力矩阵里按 business 档位卖，**后面
什么都没有**。这是本仓唯一一处「已经卖了但空着」的缝。

## 候选方案

三个方案各自独立设计后过了两轮评审（治理安全视角 / 产品价值视角）：

1. **arda 拥有实体主数据，yucer 只读镜像**（`yucer_ref` schema + `arda_ref` +
   冻结 `account.industry` / `.region`）。两位评审 4/10。设计本身是对的，**时机是错的**：
   它要花掉一个新 schema、一次增量、一次 Prisma lockstep 抬升、一次永久列冻结，去对赌
   一个尚未发布任何东西的 API，而换来的今天只被渲染成一个没有任何规则读取的
   `' / '` 拼接字符串。
2. **arda 作为读侧联邦**（零 DDL，读时富化 + 对外发布抽取）。4/10 与 7/10。被扣分的
   点很具体：在租户模型与留存模型都未发布的情况下就带外发。
3. **arda 作为「事实来源」接在信号缝上**（一期零 DDL、只入站）。**两位评审均给 9/10。**

## 决策

**采纳方案 3。arda 是一个入站事实来源，不是存储，也不是主数据。**

### 1. 一条 arda 记录只会变成一行 `yucer_pipeline.signal`

经现有的 `recordSignal` 端口写入。**37 张表里，其余任何一张都不知道 arda 存在。**

### 2. 归属，用数据库已经在执行的那条线来表达

`signal` 这张表天然分成两半，而列级写锁已经把它锁成了两半：

- **证据半边**（`source` / `source_ref` / `signal_type` / `subject` / `payload` /
  `detected_at`）：插入后冻结，无 UPDATE 授权。**arda 只能供给这一半。**
- **裁决半边**（`account_id` / `score` / `status`）：**绝对属于 yucer。** arda 不碰。

一句话：**凡是带 yucer 业务编号的东西，都是 yucer 的，永远不出仓。**

### 3. 一期只取数，没有外发

这不是排期，是决定本身：**入站可逆，披露不可逆。** 一期不做任何 `publish`、
`share_outbox`、抽取、内容摘要、外发水位协议。留存与撤回模型两边都未发布
（联络函第 16 问），在那之前设计外发就是用猜测约束不可逆动作——ADR-007 记录了上一次
这么做的实测代价。

### 4. arda 只出现在**一个**调用点：ADR-010 的作业路由

没有页面渲染、没有服务端组件、没有任何域服务调用 arda。

**可逆性是运行期性质，不只是 schema 性质。** 页面一旦 `await` 了 arda，arda 的故障
就是 yucer 的故障，「关掉就行」也就不再是一次 env unset。

### 5. 零 DDL——这是正确，不是省事

三条依据都对着真 DDL 核过：

- `signal.source` 是 `VARCHAR(64)` 且**没有 CHECK**。`00_baseline.sql:402` 那串
  `web/news/campaign/crm/manual/partner` 是**注释**，不是约束；表上只有
  `chk_signal_type` / `chk_signal_status` / `chk_signal_score`。所以
  `source = 'arda'` 今天就合法。
- `uidx_signal_ws_source_ref UNIQUE (workspace_id, source, source_ref)` 已经是判重键，
  且 `PrismaSignalStore.recordSignal` 已经在唯一冲突时返回 `null`。因此水位可以
  **推导**（`MAX(detected_at) WHERE source='arda'`，回拨 `ARDA_SYNC_OVERLAP_HOURS`
  重叠重取），不需要游标表。
- 度量链 `arda → signal → lead → opportunity` 已经建在冻结列上（`lead.signal_id`、
  `lead.converted_opportunity_id`）。

**零 DDL 就是可逆性保证本身**，具体地说：`check-data-architecture.mjs` 仍报 37 张表，
`check-incr-grants.mjs` 无新增可查，`db-contract` 通道不可能因此变红。**撤销 = 一次
env unset + 停掉定时器 + 一条运维语句**：

```sql
DELETE FROM yucer_pipeline.signal
 WHERE source = 'arda' AND status IN ('new','scored','dismissed','duplicate');
```

已升级的行**留下**——`lead.signal_id` 冻结的目的就是让「这笔需求从哪来」永远可回答。

**一条必须写明的诚实前提**：推导水位只在 arda 容忍重叠 since 查询时成立。如果它要求
调用方自持游标，就会冒出一张水位表，零 DDL 这条就死了。这是联络函第 7 问。

### 6. 杀死判据（90 天，business 档工作区合计）

- R = 进入终态裁决的 arda 信号数；P = 升级为线索数；C = arda 溯源的成交商机数。
- **杀死**：R ≥ 200 且（P/R < 0.10 或 C = 0）。
- **进二期**：P/R ≥ 0.25 且 C ≥ 5。
- 其余情况：**保持现状，不追加投入**。

理由要记下来：**每读十条出不了一条有用线索，销售就不再打开收件箱**，而这会连带毁掉
里面本来就有的人工信号——**一条烂的信号源比没有信号源更糟，不是「至少不亏」**。
R ≥ 200 是因为 R = 50 时 10% 的置信区间大约 ±8 个百分点，那是在拿噪声判死刑。

**已知混杂因素**：水位推导漏取会产生一个偏低的 P/R，那是适配器 bug，不是判决。
援引杀死判据之前，必须先做一次**刻意的全量重取**排除它。

## 从另外两个方案里嫁接过来的约束

这些今天没有对应代码，但必须现在写下来——**压力会先于契约到来**：

- **自动驾驶排除**（源自方案 2）。ADR-003 第 3 条允许 `proposed → executed` 在
  `copilot.autopilot` 下跳过人工确认、`decided_by_sub` 留 NULL。**任何 arda 来源的值，
  不得经由自动驾驶可达的动作类型落进域列。** 一期没有 `agent_action` 路径，所以这是
  ADR 文本 + 二期的门，不是代码；写在这里是因为不写就只有把 ADR-003 第 3 条和某个
  富化想法并排读的人才会发现。
- **`asOf` / `fetchedAt` 纪律**（源自方案 2，但**收窄**）。不建通用 `ArdaFact<T>` 容器
  ——一期零消费方，建了就是浪费。改为：`ArdaFetch` 同时携带两者，
  **`NewSignal.detectedAt` 一律映射自 arda 的「事实发生时刻」，绝不映射抓取时刻**，
  并由测试钉死。`signal.detected_at` 插入即冻结，映射错了只能靠 db-init 数据订正。
  若将来真做富化，才需要那个包装类型，届时它的作用是「不手写解包就落不进域列」。
- **两条外发约束**（源自方案 1，虽然外发已推迟）。**不发布 yucer 不拥有的东西；
  `yucer_field.*` 一个字段都不发布。** 二期的执行手段是一条守卫（断言任何外发投影
  都不触及 `yucer_field.*` / `agent_message` / `agent_action.rationale`）——此处只登记，
  不建。
- **词汇表防火墙**（源自方案 1）。`yucer_gtm.market_segment.criteria` 是一份写在
  自由文本行业标签上的 JSONB 过滤器。**arda 的分类编码，禁止在任何 arda 相关变更中
  被接进细分市场匹配**；那是一次独立迁移，要带自己的数据审计。一次词汇替换会让细分
  成员数悄悄清零——没有任何约束会报错，也没有任何测试会变红。

## 后果

- `signal.feed.ingest` 复用既有权限 `signal.triage`，因此**不新增权限码、不新增
  `incr/0005`、不改种子、不改权限镜像**；`authz/catalog.test.ts` 仍在 20 权限 / 68 授权
  上对账。（既有的 `signal.feed.configure` 映射到 `admin.manage`，若沿用它，一个后台
  主体就要持有目录里最强的权限——那正是 ADR-010 第 2 条要堵的后门。）
- `platform/s2s.ts` 的 `Audience` 增加 `"arda"`。**`scopeFor` 不动**：我们认为
  `tool:arda` 对一个数据面很可能是错的，但猜一个替代值就是在自造 scope 词汇表。
  一期在 base URL 到位前本来就跑不起来，未确认的 scope 不额外阻塞任何东西。
- 一期**可合并、可单测**，但**在联络函 B 段回答之前跑不起来**——这与 Atlas / Runos
  今天的状态相同（base URL 未绑定）。

## 未决

audience 令牌、scope 字符串、base URL、游标语义，见
[vxture-arda#212](https://github.com/vxture/vxture-arda/issues/212)。其中**水位语义那一问
单独决定本 ADR「零 DDL」这条是否成立**。

**而在它之前还有一问更要紧**：Runos 的两域模型写着「L3 业务场景 Agent 必须全部经
Runos 网关」，而 yucer 是 L3。若成立，本 ADR 的传输前提整个不对——`ARDA_BASE_URL`
不该存在，`Audience` 不该加 `arda`，`http-source.ts` 瞄错了缝。反过来说，那样 arda
一期**不需要任何新平台契约**，只要一条 Runos 能力授权。本仓不裁定，已作为该 issue 的
第一问发出。

`arda` 这个名字在本仓源码里已经指向一个**兄弟产品**（`auth/lib/claims.ts:3`、
`entitlement/resolver.ts:5`、`check-docs-numbering.mjs:14` 明确拒绝「arda 连字符变体」、
`CLAUDE.md:210`）。这是平台侧的命名决定，**在回答之前本仓不改任何名字**（第 4 问）。
