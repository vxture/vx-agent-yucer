# ADR-023 - 一个问题的两个答案

- 状态：已接受
- 日期：2026-08-29
- 相关：ADR-002（域的形状）、ADR-014（产品体系）、ADR-019（底价与签字）、
  ADR-022（这个产品从未开的一个门面）、TD-016

## 背景

`yucer_core.offering` 来自 baseline，字段是
`offering_code / name / category / list_price / currency / status`，
`20-capability-domains.md` 明写它是「销售侧的产品目录（我们卖给客户什么）」。

`0007_product_catalogue.sql`（ADR-014）后来建了**第二套**，开头写：

> WHY: the model could not say WHAT WE SELL. The only "product" in the baseline
> is the platform's own product_code (yucer itself, from C2).

**这个前提在写下的当时就是错的。** `offering` 已经在那里，而且已经被文档定义为正是
这件事。ADR-014 绕着一张它没看见的表做设计，此后这个产品对同一个问题一直有两个答案。

## 判据与裁定

哪一个活下来不难判：

| 判据 | `yucer_core.offering` | `yucer_catalog.product` |
|------|----------------------|------------------------|
| 字段 | code/name/category/list_price/currency/status | 全部具备，另加 `unit`、独立的 `price_book_entry`（含**底价**）、`solution`/`solution_item` 报价模板 |
| 被外键引用 | **0** | `opportunity_line`、`line_discount_approval` |
| 服务 / 存储 / 界面 / 种子 | 都没有 | 都有 |
| TypeScript 引用 | 仅列锁镜像 + 两条从未求值的动作 | 全域 |

`product` 是严格超集，删 `offering` **不损失任何能力**。

## 决定

删除 `yucer_core.offering`（增量 `0015_drop_offering.sql`），连同它的列锁、
TS 镜像、Prisma 模型、两条动作声明与两条守卫豁免。权限目录不受影响——
`account.offering.*` 复用的是既有的 `account.read` / `account.write`，没有专属权限。

## 为什么这不是「整洁」问题

留着它的代价不是不好看，是一条真实的失败路径：**两张表都声称能给我们卖的东西定价。**
哪天有人往 `offering` 写了一个 `list_price`，它就与底价规则实际读取的
`price_book_entry` 分叉——**底价错了，就是错误的一批单子跳过了签字**。
那正是 ADR-019 要防的那件事，只不过从一扇没人记得还开着的门进来。

## 与 ADR-022 的区别

ADR-022 删 `project_task` 是因为**中间从未存在过，而且那件事本就不属于这个产品**
（任务管理是交付工具的地盘）。这里不同：这件事**属于**这个产品，而且已经建好了——
只是建了两遍。删的是重复，不是能力。

## 这次真正该记住的

ADR-014 不是判断失误，是**没查**。它断言 baseline 里没有产品目录，而 baseline 里有，
并且同一批文档里就写着。数据模型有唯一性约束，词汇表也已经因为同样的教训加了
（见 CLAUDE.md「产品词汇」一节，2026-08-26 抓到两次碰撞）。**建一张新表之前，
先确认这个问题还没有答案**——和加一个分类概念之前先确认那个词没被占用，是同一条规矩。
