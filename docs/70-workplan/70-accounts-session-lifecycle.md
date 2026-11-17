# Accounts 统一登录、退出与账号切换

对应 [Issue #658](https://github.com/vxture/vx-agent-yucer/issues/658)。

## 行为与接口

Accounts 是身份的唯一来源。已核对平台当前 `bff/auth-bff/src/routers/oidc.router.ts`
与 `bff/auth-bff/src/oidc/session-status.ts`：

- 服务器使用 confidential client Basic 凭据调用 `POST /oidc/session/status`，
  请求只有 `sid` 与布尔值 `active`；响应为 `valid:false`，或
  `valid:true,next_check_at`。浏览器不接触令牌、中央 sid 或客户端密钥。
- 用户实际页面访问和操作报告 `active:true`；状态探测、重新聚焦与后台校验使用
  `active:false`。是否强制校验与是否续期分开，不再依靠刷新令牌判断登录状态。
- 访问页面、主动刷新和重新聚焦立即校验。打开的可见标签页每 15 秒探测本地状态，
  后台中央查询遵循 Accounts 返回的检查时间；隐藏标签页重新显示时强制查询。
- 本地 `POST /auth/logout` 明确返回 303，由浏览器顶层 GET 访问 Accounts
  `end_session`，保留中央 Cookie、client_id 与登记过的回跳地址。
- 切换用户先删除旧 RP 会话、结束中央登录，再发起 `prompt=login`；中止切换不会
  使用原来的本地会话。回跳意图只接受同源路径，短期 HttpOnly Cookie 保存。
- 中央无效时，外层会话边界整体卸载 Header、导航、助手及业务内容。身份、组织或工作区
  变化触发硬刷新，丢弃上一账号的 Next 路由缓存。无角色与无订阅页面也参与校验。
- 中央或 Redis 不可用时保留可恢复凭据，停止呈现受保护内容，提供重新检查；
  `/auth/session` 返回可重试 503，不冒充已登录或已退出。

## 并发与通知

Redis Lua 原子撤销同 sid 的全部 RP 会话并保留撤销标记，阻止晚到的授权回调重新创建。
状态确认与令牌续期只通过比对原记录和当前租约持有者更新；已删除的会话不能写回。
异步状态探测不写浏览器会话 Cookie，避免旧探测晚返回时清掉另一标签页刚登录的新账号。
旧租约持有者不能释放新锁或覆盖新结果。

后台退出通知校验 RS256、issuer、产品 audience、sid、iat、jti 与事件类型，拒绝 nonce。
撤销是幂等的；存储失败返回 503，供 Accounts 重试，避免先占用 jti 后丢失撤销操作。

## 验证记录

- 认证回归 92 项通过，包括真实 RSA 签名通知、HTTP POST → 303 → GET、
  只读强制校验、暂时故障恢复、通知丢失，以及状态查询／令牌续期与撤销并发。
- 真实 Redis 7.4.2 验证同 sid 多 RP、重复撤销、账号隔离、晚到授权回调、
  过期租约与原子更新。CI `test-coverage` 增加隔离 Redis 服务，持续执行该组测试。
- 全量测试：2,999 项通过，451 项数据库专项因离线环境跳过；新增实际活动断言在最终
  92 项认证专项中通过。TypeScript、生产构建及文档／页面／错误响应检查通过。
- Chromium 真实浏览器使用隔离 Accounts 协议服务与 Redis 完成七项验证：业务外壳正常
  加载、中央故障移除保护外壳、重试恢复、外部退出且通知丢失时重新聚焦清理、账号变化
  硬刷新、实际 POST 退出经 303 转为 Accounts GET、切换先退出再请求新账号登录。
  浏览器验证额外发现账号变化期间登录入口与硬刷新可能竞争，已改用无业务内容的
  “正在更新账号”状态，避免意外发起静默登录。隔离协议验收不能替代生产联合验收。
- 未修改平台、Atlas、Runos 或数据库结构；用户本地 `fire.png` 保持原样。

## 上线后的联合验收

实际 Accounts 与 Yucer、CoSpace、Console、ruyin.work、官网建立新客户会话，
分别从 CoSpace 与 Yucer 退出，再用账号 A/B 切换，核对所有打开页面与受保护 API。
需要记录实际通知接收、sid 关联、浏览器 Accounts GET 和运行版本；记录不包含凭据。
生产尚未执行此项验收时保持 Issue 开放，不把协议测试结果称作全域上线验收。
