# 30 - 生产部署审批 runbook

## 规则（owner，2026-09-14）

部署必须 review：每一次到 production 的运行都停在 GitHub Environment
`production` 的门上，由 owner 本人（GitHub `stonesmoker`）在 GitHub 页面点击
Review deployments 批准。agent（Claude）可以调度、可以推 tag，**不得代为批准**
——`pending_deployments` API 用 owner 的 token 一样能批，这条禁令是流程规则，
不是技术限制，写在 `CLAUDE.md` 里让每个会话都读到。

## 哪些运行会停在门上

| 工作流 | 触发 | 停门的 job |
|--------|------|-----------|
| `deploy.yml` | push tag `v*.*.*`（或 dispatch 时 `explicit_environment=production`） | `deploy`，在 `docker-build` 成功之后 |
| `db-init.yml` | dispatch `environment=production` | `db-init` |
| `env-update.yml` | dispatch `environment=production` | `env-update` |
| `rollback.yml` | dispatch `environment=production` | `rollback` |

四个工作流共用并发组 `deploy-production`：同一时刻只有一个在跑，后来的排队，
不取消进行中的。`beta` 不设门（owner，2026-09-10）。

## 在哪点

1. 通知：GitHub 给 required reviewer 发「Deployment review required」（站内 +
   邮件）。
2. Actions -> 该 run -> 顶部黄条「Review deployments」-> 勾 `production` ->
   可留 comment -> Approve and deploy，或 Reject。
3. 命令行只看不批：`gh run view <id>` 显示 `waiting`；
   `gh api repos/vxture/vx-agent-yucer/actions/runs/<id>/pending_deployments`
   显示 environment、reviewers、`current_user_can_approve`。

## 批准前核对（按工作流）

- **db-init（apply）**：`expected_sha` 等于 main 当前提交，且该提交的 PR 已合并、
  六个必需检查绿；PR 里有 twin 演练记录（应用数、二次 apply 为空操作、与全新
  库的 `pg_dump` diff、db 测试两库都过——见 `20-github-bootstrap-checklist.md`
  「twin 必须回放失败的运行」）；`bootstrap_through` 只在账本为空的第一次给；
  分清 `action=apply` 与 `verify`。
- **deploy（v tag）**：tag 指向的提交所需的增量已经在生产账本里——先 db-init
  后 deploy（`20-github-bootstrap-checklist.md`「Release」）；`docker-build` 已
  成功（门在 build 之后）；Environment 的 `STACK_ROOT` / `PROJECT_NAME` /
  `APP_PUBLISH_PORT` 与目标一致。
- **env-update**：`mode=replace`（默认）要求 `ENV_FILE_BASE64` 是**完整**文件——
  它整体替换 `etc/.env`；`mode=patch` 只把 `ENV_PATCH_BASE64` 里的 `KEY=VALUE`
  行合并进主机上现有的文件，其余键不动（2026-09-14 加，因为没有能 ssh 到主机
  的操作机）。两种模式下只要 `ENV_PATCH_BASE64` 存在都会在最后叠加一次，所以
  过期的 `ENV_FILE_BASE64` 也不会把平台值冲回空白。`.env.prev` 会保留一份，坏
  值一步可退。核对：补丁只含要改的键，且不含 `POSTGRES_PASSWORD` /
  `DATABASE_URL`（改它们不会改数据库里的真密码）。
- **rollback**：`commit_sha` 是以前部署过的构建（镜像还在 GHCR / ACR）；数据库
  结构不回滚——增量不可逆，回滚只回滚应用镜像。

## 批准后看什么

- db-init：日志里 `[db-init] increments: N applied, M already recorded`，N 等于
  预期；可再 dispatch 一次 `action=verify` 看账本最新五条。
- deploy：`[deploy] verify OK (health 200)`；`https://yucer.vxture.com/api/health`
  的 `gitSha` 等于 tag 指向的提交。失败自动开或更新 `deploy-failure` issue，成功
  自动关。
- 回填：账本高水位记入文档；生产 `.env` 有变动就同步 `ENV_FILE_BASE64`。

## Environment 配置（2026-09-14 收紧）

| 项 | 值 | 为什么 |
|----|----|--------|
| required reviewers | User `stonesmoker`（owner） | 唯一审批人 |
| prevent_self_review | off | 单人仓：触发者与审批人是同一个人，开了就没人能批 |
| wait_timer | 0 | 门是人，不是时间 |
| deployment branch policy | custom：`main`（branch）+ `v*.*.*`（tag） | db-init / env-update / rollback 只从 main 调度，发布只走 v tag；从别的分支 dispatch 到 production 会被拒 |
| can_admins_bypass | off | 管理员也不能绕过审批人列表；owner 本人就是审批人，不受影响 |

配置文件：`rebuild/production-environment.json`，应用与核对命令在
`rebuild/00-index.md`。核对：

```bash
gh api repos/vxture/vx-agent-yucer/environments/production --jq '{rules: [.protection_rules[] | {type, prevent_self_review, reviewers: [.reviewers[]?.reviewer.login]}], branch_policy: .deployment_branch_policy, can_admins_bypass}'
```

```bash
gh api repos/vxture/vx-agent-yucer/environments/production/deployment-branch-policies --jq '.branch_policies[] | "\(.type): \(.name)"'
```

## 已知边界

- `beta` 无门，按 owner 2026-09-10 的裁定。
- 这套门管的是**运行**，不管**合并**：`main` 的 ruleset 是 0 approvals，检查即门
  （`CLAUDE.md`）。
- `can_admins_bypass` 可以通过 REST PUT 设置（2026-09-14 已验证，随
  `rebuild/production-environment.json` 一起应用）；页面 Settings ->
  Environments -> production 上也能改，改完用上面的核对命令确认。
