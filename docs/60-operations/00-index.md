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

### TD-002 - 产品界面文案违反 source ASCII-only 规则

`CLAUDE.md`「Repository hygiene」要求 source 文件 ASCII-only。
`portals/app/app/(app)/lib/messages.ts` **违反这一条**：它包含中文界面文案。

**为什么存在**：yucer 的主市场是中国企业销售组织（`brand.ts` 的
`defaultLocale: "zh-CN"`，全部产品规格以中文撰写）。界面文案不可能既是 ASCII 又是
这个产品该有的样子。

**已做的收敛**：全部面向用户的字符串集中在这**一个**文件里。因此：

- `app/` 下**有且仅有一个** source 文件含非 ASCII，可用一行命令机器校验；
- 规则层、门控层、客户端、组件、视图映射**全部保持 ASCII**；
- 将来替换只是换一处 import，不需要重写组件。

**为什么没有就地"修掉"**：可以把文案改成 JSON + `\uXXXX` 转义，那样 100% ASCII 且
仍渲染中文——但那份文案将无法被人类阅读和维护。用一份不可维护的文案换一条规则的
字面满足，是更差的结果。

**偿还条件**（二选一，都不在本仓单方面决定）：

1. 平台仓修订标准，为面向终端用户的文案显式开一个口子，本仓随后镜像；
2. 引入正式 i18n 方案，文案移出 source 树（例如运行时加载的 locale 资源）。

`CLAUDE.md` 明确规定「标准的缺口先在平台仓修，不得在产品仓内自造标准」，所以这里
**只登记，不裁定**。在裁定之前，收敛状态维持不变。
