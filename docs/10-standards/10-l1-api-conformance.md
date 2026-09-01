# 10 - L1 API 规范符合性自陈（product_251）

- 对象标准：平台 `product_251`「L1 API 规范」v0.3（2026-08-16）
- 自陈日期：2026-08-17
- 状态：**部分符合，差距逐条列明**

## 为什么有这份文件

`product_251` 的适用范围写的是「约束 Atlas / Runos / platform 及**此后每一个接入的
agent 产品**」。yucer 是 agent 产品。

其中 **D-2** 是这条标准里最硬的一款：

> 此后新接入统一运营台的每一个产品**MUST** 在首个对外版本即满足全部 MUST 条款。
> **不适用「存量迁移」档**——那一档只给本规范生效前已存在的接口。新产品 **MUST** 在
> 接入评审时提交本规范的**符合性自陈**；有豁免 **MUST** 走豁免登记。

yucer 的首个生产 tag（批次 4 的 `v0.1.0`）**还没打**，所以「首个对外版本」这个门槛
在前面，不在后面——现在补齐的边际成本接近零，等长出来再收敛就是标准自己说的那种代价。

**这份文件本身就是 D-2 要求的那份自陈。** 2026-08-17 之前本仓 `grep 251` 零命中：
不是不合规，是**根本不知道这条标准存在**。差距是复核平台文档时发现的，不是任何守卫
报出来的。

## 逐条

| 条款 | 要求 | yucer | 证据 |
|------|------|-------|------|
| **X-1** 错误信封 | `code`（SCREAMING_SNAKE + 模块前缀）· `message` · `retryable`（**必有**）· 可选 `field`；承载位置随传输，字段名不随 | **符合** | `platform/envelope.ts` 单一实现；`check-error-envelope.mjs` 在 CI 里校验 |
| **X-1** 拒绝词表 | 一律用 `NOT_ENTITLED` / `POLICY_DENIED` / `APPROVAL_REQUIRED` / `QUOTA_EXCEEDED`，不得各造各的 | **符合** | `violationEnvelope()`：权益门 → `NOT_ENTITLED`，权限门 → `POLICY_DENIED` |
| **X-2** 归因 | agent 发起的调用**必带** `task_id`，被调方原样落库 | **符合** | Atlas 与 Runos 同一个值，`turn-service.ts` 算一次发两处（此前 Atlas 一侧完全没发，见 ADR-004「版本漂移」） |
| **X-3** 审计与计量字段名 | `eventId · occurredAt · actorId · actorConsole · objectType · objectId · action · outcome`，消费面加 `taskId · costAmount · costUnit` | **不符合，真差距**（登记为 TD-018） | 见下「X-3 复核」 |
| **X-4** 版本与弃用 | 依赖的每个对象**可钉版本**并能被告知弃用 | **不符合** | `resolve()` 全部用浮动别名 `stable`；`deprecated` 生命周期字段本仓不声明、不读取 |
| **G-1** 请求元数据 | 每次调用带身份链；其余元数据永远可选 | **符合** | `_meta.vxture` 带 `task_id` / `session_id` / `agent_version` |
| **G-2** 错误承载位置 | 执行失败走模型可读通道，协议/鉴权失败走传输层原生通道 | **符合** | 流式失败以 `data:` 帧送出（HTTP 已 200）；传输层 401 走传输层，且**不再**被贴成 `not_entitled` |
| **A-1** 管理面信封 | 4xx/5xx **必须**结构化，不得裸字符串 | **符合** | 同 X-1；守卫覆盖 |
| **A-3** 分页与批量上限 | 无界流水**必须**给 cursor + 服务端钳制的 limit；批量上限**必须**在错误里回明，不得静默截断 | **部分** | arda 适配器**拒绝**而非截断（回 `unmapped`），符合后半条；本仓自己的列表接口尚无 cursor |
| **D-1** 破坏性变更 | 先标弃用、通知、并存一个版本周期 | **不适用**（本仓是消费方） | 但**已被这条保护失败过两次**：Atlas 与 Runos 的改名都是本仓读文档才发现的 |
| **D-2** 新产品准入 | 首版即全 MUST；提交自陈 | **本文件即自陈**；X-3 / X-4 两项差距如上 | — |
| **D-3** 守卫脚本 | **SHOULD** 用脚本校验可自动判定的部分 | **符合** | `check-error-envelope.mjs`（错误码大小写与前缀、裸字符串），随 `check-port-consistency.mjs` 一起进 `static-checks` |

## 豁免登记

| 位置 | 豁免什么 | 理由 |
|------|---------|------|
| `auth/backchannel-logout/route.ts` | X-1 错误信封 | 该端点应答的是 **IdP，走 OIDC Back-Channel Logout 1.0**，不是 vxture 消费方。对面是一个从没听说过 `code` / `retryable` 的标准实现，它据以动作的全部内容就是状态码。把信封换成 vxture 的形状，等于拿一个对面没实现的标准去换一个它实现了的标准 |

守卫的 `EXCLUSIONS` 里也有这一条，并带同样的理由——**豁免清单不写理由就会变成缺陷
藏身的地方**。

## X-3 复核：不是冲突，是范围划错了一次

2026-08-17 的自陈把这条记成「X-3 与 `product_200 §4.1` 各说各的」，判为需要平台
裁定的权威冲突，发去了 [vxture-platform#269](https://github.com/vxture/vxture-platform/issues/269)。
**2026-09-01 按《产品接入通则》复核，这个判定是范围划错，不是真冲突。**

通则里的三产品通道矩阵明写：这张表「逐格取自 `product_200_integration` 的登记表，
未改写」——`product_200 §4.1` 与 X-3 从来就不是同一层的两份文档在打架，是**两个不同
用途的形状**：

- **C3 用量上报信封**（`workspace_id` / `product` / `metric` / `amount` /
  `idempotency_key`）是**上行给平台计量服务**的传输信封，本仓 `usage/lib/buffer.ts`
  照 `product_200 §4.1` 实现，**继续对**。
- **X-3 是审计记录的最小字段集**（`eventId` / `occurredAt` / `actorId` /
  `actorConsole` / `objectType` / `objectId` / `action` / `outcome`，消费面另加
  `taskId` / `costAmount` / `costUnit`），要求的是**本仓自己留一份可查的事件记录**，
  不是要求把 C3 信封改名。

`grep -r audit` 本仓零命中——**这本身就是答案**：不是把两份字段名对不上，是本仓
从未建过 X-3 要求的那张审计记录表。`usage/lib/flush.ts` 里的 `gated` 只是一次
调用返回值里的内存汇总（`{ scanned, flushed, gated, retried }`），从不落盘，X-3
点名的「有列不等于有记录」在这里的准确说法是「连列都没有」。

通则同时把两处此前会被误解的地方讲清楚了：

- **`actorConsole` 是既有身份字段的改名，不是新列**——铸造这次 OBO 换票的工作台
  RP（令牌里的 `act.sub`）；本方自产的写填进程常量，不属于任何控制台的后台通道
  （如本仓的 job token 路径）填 `NULL`，不得硬编一个值。
- **`costUnit` 是开放词表**：产品自己声明并登记计量单位（本仓是 `metric` 已经
  承担的角色），不要求全平台一套 schema。

本仓侧判定已改为「真差距，非冲突」，不再等平台裁定谁覆盖谁——**回帖仍待办**：
`vxture-platform` 不在本仓协作者可达的组织仓库列表里（`gh repo list vxture` 查无
此仓），复核结果暂时只落在这份文件里，回帖 [vxture-platform#269](https://github.com/vxture/vxture-platform/issues/269)
是 owner 侧待办。

**C3 的信封本次不动**——它一直是对的，X-3 要补的是旁边一张本仓从未建过的表，不是
把这张信封改名。

## 已知差距的处置

- **X-4（可钉版本 / 弃用信号）**：真差距，登记为 TD-004。修法是 `resolve()` 钉解析后的
  semver、读回 `version_resolved`、声明并读取 `deprecated` 生命周期。当前用浮动
  `stable` 意味着**运营者改指别名时本仓行为改变，而没有代码变更、没有信号、没有测试
  变红**。
- **X-3（审计记录表缺失）**：真差距，登记为 TD-018。C3 用量信封不动；要补的是一张
  本仓从未建过的审计事件表，按通则的最小字段集实现（含 `actorConsole` 的既有字段
  改名口径与 `costUnit` 的开放词表口径）。
- **A-3 的 cursor**：本仓列表接口目前都是工作区内小集合，但这是「现在小」不是「有界」。
  与自审查出的四处无界读取一并处理。

## 这份自陈怎么维护

**不靠人记。** 能机器判定的条款由 `check-error-envelope.mjs` 守着，改坏了 CI 红。
不能机器判定的（X-3 审计记录表、X-4 版本钉法）在上表里逐条写明状态，改变状态时改这张表。

标准本身更新时，本仓没有任何自动手段知道——**这正是 D-1 那条「通知消费方」没有规定
通知渠道所留下的洞**，也是本仓两次契约漂移的共同成因。已发为 [vxture-atlas#248](https://github.com/vxture/vxture-atlas/issues/248)。
