# ADR-033 - 定时作业由产品容器自己调度

- 状态：已接受（owner，2026-09-14）
- 日期：2026-09-14
- 修正：ADR-010 的「外部定时器」一半；ADR-010 的路由与作业主体规则不变

## 背景

ADR-010（2026-08-16）把周期性作业定为「内部令牌门控的路由 + 平台侧/宿主机的外部
定时器」，理由是应用内定时器在多副本下会重复执行、重启会丢一个周期。结果是：
生产从 2026-09-10 上线到 09-14，**没有任何东西调用过这三条路由**。承诺逾期扫描一次
都没跑，用量冲洗一次都没跑，而这两件事在日志里都不会报错——一个没人调用的路由和
一个正常的路由看起来一模一样。

09-14 盘点时还发现第二个问题：`runCommitmentSweep` 与 `runArdaSync` 只处理**调用方
传入的工作区列表**，仓里没有任何东西枚举工作区。就算装了 cron，用 `{}` 调用也是
空操作——ADR-010 假定的「平台侧调度器知道该传哪些工作区」从未存在。

owner 的裁定：worker02 上 yucer 是第一个需要定时器的产品，没有现成的宿主机调度约定；
「这些不应该是 yucer 产品内部容器提供吗」——应该。

## 决策

1. **产品容器自带时钟。** Next 的 `instrumentation.ts` 在服务进程启动时调用
   `startJobScheduler()`（`app/jobs/scheduler.ts`），按周期直接调用作业函数，不经 HTTP：
   `commitment-sweep` 每 15 分钟、`usage-flush` 每 5 分钟。周期可用
   `JOBS_INTERVAL_SWEEP_MS` / `JOBS_INTERVAL_FLUSH_MS` 覆盖，下限 10 秒。
2. **按阶段启用。** production / beta 默认开，`JOBS_SCHEDULER=off` 可关；dev 默认关，
   `JOBS_SCHEDULER=on` 可开。开关状态与每条作业的上次账目由 `/api/status` 自报
   （`jobs` 字段），状态页有一节。
3. **一个周期只跑一次。** Redis `SET NX PX` 锁（`app/jobs/lock.ts`），TTL 为周期的
   90%，**不在运行后释放**——释放会让第二个副本在同一周期内再跑一次。没有
   `REDIS_URL` 时不加锁、单副本假设、日志说明一次。ADR-010 担心的多副本重复执行由
   此消解；重启丢一个周期的代价接受（作业本身幂等、下个周期补上）。
4. **工作区枚举来自本产品。** `AuthzStore.listWorkspaces()`：有过成员的工作区——
   每个真实工作区在首次登录时必然获得的那一行。不用 `vx_provision.app_instance`：
   它到第一次 webhook 投递前是空的，等它的作业永远不会扫到已经有人在用的工作区。
5. **三条路由保留**，作为手动触发与运维排障入口；`commitment-sweep` 路由在 body 不带
   列表时改为默认枚举（原来空列表静默 no-op）。
6. **arda 同步不进调度器。** 它需要 (workspace, tenant) 对，`app_instance.tenant_id`
   由 webhook 投递填充、尚未发生；arda 本身也未配置。等两者之一到位再加一行作业。

## 不这样做的代价

- 应用内定时器与请求处理共用一个进程：一条跑失控的作业会拖慢页面。作业限定为
  「扫描与状态推进」（ADR-010 第 4 条不变），单次工作量有界；真出现重活再按
  ADR-010 候选 1 拆 jobs 容器，届时锁与枚举原样复用。
- 状态挂在 `globalThis`（同 `domains/shared/registry.ts` 的原因：instrumentation
  钩子与 status 路由是两个模块图）。dev 热更新后要重启才看到新代码——生产无此事。

## 实测

`app/jobs/scheduler.test.ts`：阶段开关、默认作业与周期下限、关闭时不排程、tick 运行并
记账并重排、锁被占则跳过、抛错记为失败不崩溃、锁 TTL 为周期 90%、start 幂等。
`app/jobs/workspaces.test.ts` 与 `authz/prisma-store.db.test.ts`：枚举去重、真库查询。
