# ADR-004 - 模型走 Atlas，能力与技能走 Runos，产品侧不自建任何一侧

- 状态：已接受
- 日期：2026-08-15

## 背景

批次 3 之前挂着一项预决策：**智能体的模型编排与工具协议尚未定型**
（见 `docs/70-workplan/00-index.md` 未决事项）。D8 销售智能助手要落地，必须先回答
两个问题：

1. **模型从哪来**——谁提供推理、谁计量、谁承担配额与失败转移？
2. **工具与技能从哪来**——智能体除了「说」还要「做」（连第三方系统、复用销售剧本、
   跑代码），这些能力如何注册、鉴权、调用？

Vxture 平台已有两个 L1 能力面回答了这两个问题：

- **Atlas**（`v0.8.0`，模型平台）：统一模型接入、路由、配额、计量，是所有其他
  vxture 产品的唯一 LLM 出口。
- **Runos**（`v0.5.0`，商业能力面）：聚合、开通、承载业务 agent 的一切**非模型**
  能力——连接器、技能、执行器、资产的唯一能力门。

yucer 在这两个面的词汇里都是「N×agent」中的一个业务场景 agent，即**消费端**。

## 候选方案

1. **产品内直连模型厂商 SDK + 自建工具注册表**。上手最快，但产品自持 provider
   密钥、自算用量、自建能力目录，等于在产品里复制两个 L1 平台，且平台侧完全看不到
   这部分流量——计费主体（租户 × 工作空间）这张表上直接缺一块。
2. **模型走 Atlas，工具在产品内自建**。解决了计量，但技能与连接器仍然散落在产品里，
   无法被治理（准入分级、风险上限、审批、配额、凭证代理全部落空）。
3. **模型走 Atlas，能力与技能走 Runos，产品侧一侧都不自建**（本 ADR 采纳）。

## 决策

### 1. 模型只经 Atlas，且只按 `endpointCode` 路由

- 本仓**没有** provider SDK、**没有** provider 密钥、**没有**直连的 baseURL。
  一次不经 Atlas 的模型调用是未计量、未配额、平台不可见的调用。
- 路由**一律用 `endpointCode`**，不用 `modelCode`，不用 `taskProfile`：
  - `modelCode` 把产品钉死在一个具体模型上，运营者把稳定能力名改指到更好的模型时
    我们够不着；
  - 且走 endpoint 路由时**失败转移链属于 endpoint**，模型自己的
    `config.fallbackModelCodes` 不再叠加——写死 modelCode 等于放弃安全网；
  - `taskProfile` 随旧授权轴退休，新接入不得使用。
- 产品命名**任务**，运营者决定每个任务用什么模型。映射见
  `portals/app/app/agent/atlas/endpoints.ts`，四个任务（`chat` / `propose` /
  `score` / `summarize`）各自可由环境变量改指，改指不需要发版本仓。

### 2. 能力与技能只经 Runos 的四工具面

- 唯一入口 `POST /v1/mcp`，四个固定工具：`runos_discover` / `runos_resolve` /
  `runos_invoke` / `runos_report_outcome`。没有按能力动态注册的工具，没有私有 SDK。
- 每次调用 `_meta.vxture.task_id` **必填**（≤128 字符），一次任务内保持不变。
- 授权主体是**产品**（Runos ADR-010）：`act.sub = yucer`。产品持有什么授权，租户
  就能用什么；**Runos 侧没有 tier 概念**，租户在产品内怎么分档是 yucer 自己的事
  （即本仓的能力矩阵 + 权限目录两道门）。

### 3. Skill：Runos 只分发，执行在 yucer 自己的运行时

这是本 ADR 最容易被实现错的一条（Runos ADR-006 / ADR-009）：

- 对 skill 调用 `runos_invoke` 是一次 **fetch**，不是执行。操作固定 `fetch`、
  `arguments` 固定空对象、风险等级固定 `read`。
- 返回 `_meta.vxture.result_kind = "distributed"` 时，**内容由 yucer 自行加载执行**；
  字段缺席**视同 `"executed"`**。
- **「执行」在本产品的确切含义**：skill 是 Agent Skills 格式的**程序性知识**
  （一份 SKILL.md 指令），不是程序。yucer 执行它 = 把它载入 copilot 的上下文让模型
  遵循，并通过同一个网关调用它点名的能力。本仓**不 eval、不 require、不 spawn**
  任何 skill 内容——「agent 自己执行」说的是指令进入谁的上下文，不是邀请在产品里跑
  第三方代码。
- skill 内容是**经网络到达的第三方文本**，渲染进提示词时必须**带来源围栏**
  （`renderSkillPrompt`）：模型必须能把它与产品自身的指令区分开，否则一份 skill 就能
  冒充系统提示词。
- `content_digest` 逐次校验并把校验结果**显示在围栏里**（verified / unverified）。

### 4. 两个面的令牌都必须带 `workspace_id`

Atlas **只从令牌** 读工作空间（`/v1/chat` 根本没有 `workspaceId` 字段；
`/v1/embed` 的 body 字段被接收后不被任何逻辑读取，Atlas TD-035）。缺失时
**不报错**：配额检查整个跳过，用量记 NULL 工作空间，流量从「租户 × 工作空间」这个
计费主体上掉出去。

因此 `portals/app/app/platform/s2s.ts` 把缺 `workspaceId` 当**编程错误直接抛出**——
抛出是唯一有人会注意到的结果。

## 理由

- **两个 L1 面已经解决了产品不该重复解决的问题**：配额、计量、失败转移、准入分级、
  凭证代理、全链路审计。产品重做任何一项，都是在做一个更差的版本，并让平台侧的账
  对不上。
- **按 endpoint 而非 model 路由，是唯一能同时保住失败转移与运营自由度的选择**。
- **skill 只分发不执行，恰好与 ADR-003 的人机边界同构**：Runos 交出内容、yucer 决定
  怎么用；模型给出提案、人类决定是否执行。两层都把「产出」与「生效」分开，理由相同。
- **`result_kind` 缺席视同 executed** 而不是 distributed：反过来默认会让产品把一次
  真实调用的输出当成「参考资料」交给用户，即产品以为自己做了某件事、实际只是读了
  一段文本。

## 后果

- 正面：D8 的模型与工具两条腿都落在被治理的平面上；产品侧零 provider 密钥，四层
  密钥卫生不被削弱；运营者可以在不动本仓的前提下换模型、上下线能力。
- 负面：
  - yucer 的可用能力集**取决于运营侧是否已注册并授权**。Runos 生产目录目前为空且
    enforcement 关闭——首注册、首授权、开 enforcement 是接入前的运营三步，
    在那之前 `runos_discover` 返回空列表，这是正常返回而不是故障。
  - Atlas 与 Runos 目前**只在 tailnet 内**（`atlas.vxture.com` 保留未绑定），
    基址按环境从部署方取，不得写死。
  - 新增两条集成通道意味着状态页与 `.env.example` 需要相应扩展（本批次已随代码给出
    配置键，注册清单待批次 4）。
- 与既有决策的关系：本 ADR 是 [ADR-003](ADR-003-agent-actions-are-proposals.md) 的
  实现前提——提案的**内容**由 Atlas 产出、提案可能引用的**动作**由 Runos 提供，而
  「提案 -> 人类落章」这一层不变，两个平面都不能绕过它。

## 未决

- Runos 的 `delegation_token`（对象级判定凭据）如何从 yucer 的会话派生，尚未定型。
  当前实现透传调用方给的值，不自行构造。
- 外部信号源（`signal.external_feed`，批次 5）究竟走 Runos connector 还是平台侧
  数据服务，取决于运营侧注册了什么，留待批次 5 决策。
