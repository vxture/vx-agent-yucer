# XY-00B - 平台供给核验记录

追踪：[#734](https://github.com/vxture/vx-agent-yucer/issues/734)，总表：[114](114-xiaoyu-execution-batches.md)。
状态：🟡 实施中；没有把配置、目录或夹具测试计为真实业务执行成功。

## 一、验收清单

- [x] 记录受控查询、业务表单草稿、原服务提交与版本化执行契约，分配至 01A、04A、04B、05。
- [x] 核对现有 Atlas／Runos 消费协议、分页能力与既有生产诊断流程。
- [x] 线上 `/api/status` 显示两个平台配置存在且可达；仅属连接证据。
- [x] 准备固定核验脚本及精确 main／production 审批工作流；本地失败与脱敏测试通过。
- [x] 使用聿策实际 service 身份与平台当前核验的 workspace 分页读取目录，不替换为运维账号授权。
- [x] Atlas 获授 10 条 active 路由、状态、容量、接口与预算清单；多模态未实测。
- [x] Runos 四类目录计数、分页完整性、受控版本、相关依赖与首 20 项以外发现证据。
- [x] 真实公开资料搜索、网页读取和 Skill 分发回执。
- [ ] 业务相关 Skill 依赖适配与 Atlas 成功调用／安全失败回执补齐；本次对话 400、向量／重排 503。
- [ ] 任务映射、可用／已授权待验证／契约缺失／平台异常矩阵及必要上游 Issue。
- [ ] 核验报告回填、PR／CI 记录、批次验收；未实测部分保持未完成。

## 二、已取得的证据与环境边界

2026-11-22 04:07 UTC（本地 11 月 21 日），公开状态接口报告：
聿策生产 gitSha `9252b44d`，Atlas 与 Runos 均 configured/reachable。
这不证明 12 条路由、约 800 项 Skill 已被当前产品完整授权，更不证明逐项可执行。
这些数量仍是 owner 提供的背景，以实际目录核验为准。

本机没有 worker02 SSH 配置或 Tailscale CLI，直连平台内网返回空响应，无法据此读真实授权目录。
既有 `ai-supply-check.yml` 只做固定只读库存与历史调用元数据，不铸票、不实调，不能满足本批全部验收。
生产核验走固定脚本、精确 main 提交和现有 production 审批；不绕过 owner 审批取得服务器凭据。

`xiaoyu-supply-check.yml` 在聿策现有容器内，按已接入的产品级 `provisioning:read` 契约
只读调用 `/platform/provisioning`。完整扫描当前关系后，选择更新时间最新且为 provisioned
的真实 tenant/workspace；不从本地可空租户投影或调用历史推断归属。
每页最多 200 条、最多 100 页，总上下文预算两分钟；分页截断、重复工作空间／游标、
非法标识、响应异常或没有当前关系时，均在平台目录调用前停止。
不调用产品 reconciliation、ACK、usage 或持久化路径，不伪造隔离键。
此处复用实际运营上下文，只执行固定公开供给探针，并非隔离测试工作空间业务验收。
真实报告记录所用上下文和 service 模式；用户 OBO、表单写入和隔离测试空间仍在后续批次验证。

凭据仅在既有聿策容器内使用。目录每页 20 条、总计最多 200 页／类型，逐项解析 stable 并记录具体版本；
最多四路并发只读解析，重复游标、重复条目、总数变化／截断均不计完整。
公开研究仅允许 `exa.web-research` 的已解析只读搜索和读取操作，不执行目录内其他连接器／执行器。
Skill 只加载并记录分发回执，不将内容当脚本运行，也不声称已经执行；其声明依赖与实调是否匹配分别记录。
Atlas 仅在实际获授且 active 的 chat、embedding、rerank 分类各选择一条做固定小样本；
无路由、调用失败、截断或缺失回执记录 partial，不将其他路由视为已验证。
费用未由响应提供时记未知，不估算成零。报告以 14 天 Artifact 保存，不在 Actions 日志展开目录正文。

本地验证为夹具，不是生产证据：Python 7 项边界测试、Node 18 项控制流／协议测试；
原只读库存的 9 项安全测试继续保留。检查精确 main 门、只读事务、上下文 UUID、
平台撤销关系、完整分页、错误脱敏、写风险拒绝、分发／执行回执及无效资料不进入模型。

PR #744 已合并，六项必需检查与 CodeQL 通过。其 Sonar 扫描任务成功但外部质量门失败，
原因为诊断脚本测试报告未纳入覆盖率（显示 0%，并非测试没运行）；不能表述为质量门已通过。
本批继续修正 Node／Python 覆盖率上报、Python 测试归类及新增可维护性提示，保持质量门阈值和源码分析范围。
未因此发布版本或关闭 #734。后续检查和运行记录见下文。

### 首次生产运行与修正

Owner 已批准运行 [44985901980](https://github.com/vxture/vx-agent-yucer/actions/runs/44985901980)。
2026-11-22 04:45–04:46 UTC，精确 main、固定脚本测试、Tailnet 和 SSH 均通过，
脚本返回 `unavailable / context_verification`。本次没有进入目录、Skill 或模型调用阶段，
不能归因为路由／模型授权不足，也不能将平台能力记为不可用。

旧脚本将最新一条七日审计记录作为必需前提，且多个失败只报同一个阶段，无法由回执确定具体原因。
修正后以当前 provisioning 为权威，历史仅作偏好，跳过非法／已回收／租户不匹配的历史记录；
容器缺失／歧义、当前 provisioning 查询失败、无有效当前上下文和响应格式错误分别给固定安全码，
不输出原始 stderr 或凭据。新增回归覆盖无历史、哨兵值、当前授权失效和租户／空间错配。
当前 Python 21 项（含既有库存测试）、Node 8 项通过，Python 覆盖率约 95%；真实重试结果仍待回填。

### 第二次运行与权威来源修正

PR #746 已合并（`ee937a2c`），主分支六项必需检查通过；PR Sonar 外部质量门通过，
新代码覆盖率 95.4%。Owner 已批准运行
[44988226347](https://github.com/vxture/vx-agent-yucer/actions/runs/44988226347)。
2026-11-22 05:11–05:12 UTC（本地 11 月 21 日），回执为
`unavailable / context_verification / no_valid_current_provisioning_context`。
固定测试、Tailnet、SSH 成功，但仍未进入 Atlas／Runos 目录、Skill 或模型调用。

代码核对发现本地 `app_instance.tenant_id` 是可空投影，`PrismaProvisioningStore.upsertInstance`
只保存 workspace/product/status，事件中的 tenant_id 没有写入；探针将其非空视为前提并不成立。
本次回执证实没有选出符合旧条件的上下文，并未读取逐行租户内容，不能据此声称工作空间未授权。
修正改用产品现有的权威平台 provisioning 只读接口，移除本地数据库和历史调用依赖；
不会为通过探针补写数据库、放宽隔离键或绕过当前关系检查。

当前回归：Python 16 项（含既有库存测试）、Node 14 项；平台两页完整读取、撤销／pending、
租户缺失／哨兵值、重复空间／游标、缺失末页标记、凭据错误脱敏、当前来源贯穿至实际 plane
令牌都纳入验证。Runos 失败保留标准错误码和调用编号，未知 code／原始 message 不输出。
这些仍为夹具证据；下一次真实运行结果待补。

Owner 补充确认：无需逐项重复请求已有授权；授权在路由层，由 Atlas 决定具体模型。
核验与小聿均只按获授 endpoint 调用，实际 `modelCode` 只用于审计，不固定具体模型或要求额外模型授权。

### 第三次真实核验：已取得目录与联网证据

运行 [44989687196](https://github.com/vxture/vx-agent-yucer/actions/runs/44989687196)，
main `d6c49f6e102e52ec8ef24cac214c2178eb8824f4`，状态 `partial`。
时间：2026-11-21 21:36 America/Los_Angeles（2026-11-22 05:36 UTC）；供给探针总耗时 8,271 ms。
平台 provisioning 读取 1 页／2 条关系，1 条 provisioned；以当前关系选取 service 上下文成功。
该上下文不是本人交互 OBO／隔离测试工作空间，不据此完成私人记忆 ACL 验收。

taskId：`xy00b:802a3ead-1433-4aca-8d1d-71fd441a79d9`。
完整脱敏报告保存在运行 Artifact `xiaoyu-supply-report`，保留 14 天；本段安全摘要持续保留。
原报告 SHA-256：`c064c776e1470e1709dafd2f79cdd0ce99e733aa5aaec23e038b08788974cea6`。

| 供给 | 实际可发现／解析 | 分页与版本 | 实调状态 |
|---|---|---|---|
| Atlas | 10 条 active 路由 | 6 chat、2 embedding、2 rerank | 目录成功；三个分类样本均未成功，详见下文 |
| Runos Skill | 877／877 | 44 页，20 条／页；1.0.0=503、1.0.1=326、1.0.2=46、1.0.3=2 | `fetch` 分发样本成功，未执行 Skill 内容 |
| Runos Connector | 2／2 | 1 页；均 1.0.0 | Exa 搜索／读取成功；MarkItDown 未实调 |
| Runos Executor | 0 | 1 页完整空目录 | 不宣称存在已验证执行器 |
| Runos Asset | 0 | 1 页完整空目录 | 不宣称存在已验证资产 |

Skill 首 20 项之外发现：`addyosmani.shipping-and-launch`。
Skill manifest SHA-256：`44c678b1e1286307f0e95e0ce40c3da3a86b649b8073f4bcc36514267f0b59ed`。
Connector manifest SHA-256：`cd0b507f8c61230aaa970dbd99a4318c3acee89846a838e176dcd12a1b47d5c8`。
877 个 Skill 均只声明 `fetch`，依赖数组均为空，不能把 Skill 分发目录计为同等数量的可执行工具。

#### Atlas 获授路由与任务用途

以下为当前实际目录。owner 提供的 12 路由是背景，本次产品身份返回 10 条；不虚构缺失名称，
不自动重授或改为逐模型授权。目录容量为注册信息，不是本批实测的最大值。
所有 chat 路由登记 tools/toolChoice=true、thinking=off/on；其工具执行和多模态仍未实调。

| endpoint | 分类 | 上下文／最大输出 token | 小聿候选用途（任务质量后续验证） |
|---|---|---|---|
| chat/default | chat | 512000／256000 | 常规协作与研究摘要 |
| chat/deterministic | chat | 512000／256000 | 结构化整理与一致性检查，不代替确定性业务计算 |
| chat/extract | chat | 128000／128000 | 信息提取与表单草稿 |
| chat/fast | chat | 256000／128000 | 简短问答与轻量整理 |
| chat/reasoning | chat | 512000／256000 | 复杂规划与跨对象分析 |
| chat/vision | chat | 512000／256000 | 图像／文档候选，模态能力待专项验证 |
| embedding/default、embedding/quality | embedding | 3072／未提供 | 私人记忆候选向量；default 本次 503，quality 未测 |
| rerank/default、rerank/quality | rerank | 512000／128000 | 检索候选排序；default 本次 503，quality 未测 |

顶层请求体上限：16,777,216 bytes。目录与调用权限单位均是 endpoint；不将背后的模型名称固化进业务选择。

#### 已完成的 Runos 调用

| 能力／操作 | 版本 | callId | 结果与耗时 |
|---|---|---|---|
| github.autoresearch / fetch | 1.0.0 | 01a201c1-68c1-7a50-973b-b0811701ea88 | distributed；11,126 字符，11 ms；内容未执行 |
| exa.web-research / web_search_exa | 1.0.0 | 01a201c1-68cd-79f2-8106-7b55d0290fe6 | executed；3,358 字符，2,949 ms |
| exa.web-research / web_fetch_exa | 1.0.0 | 01a201c1-7454-749c-b758-908e1ff756ac | executed；1,638 字符，1,324 ms |

来源：`https://www.unitree.com/`、`https://www.unitree.com/about/`、`https://www.unitree.com/contact/`。
读取正文 SHA-256：`6041fadffc0460d98e14d0a791ad689fc28dd3b65946774a0f298dca3ef1af2d`。
Skill 分发与 Exa 调用分别记证据；当前所加载 Skill 没有声明 Exa 依赖，因此未伪造 Skill 依赖归属。
费用响应未提供，均记未知，不能计零费用。未创建或保存任何业务对象。

#### 尚未完成与修正

- `chat/default` / `/v1/chat` 返回 HTTP 400。代码核对发现探针发送 `applicationType=agent`
  却未提供 applicationId，与 Atlas `validateChatRequest` 不符；该缺陷属消费探针，不能归为平台供给故障。
  补丁移除不完整应用归属字段，使用正常 service 默认归属，仍带产品票据、tenant/workspace、taskId/requestId。
  本次原报告没有保留标准错误码，不能声称该次实际返回码已被确认是 `APPLICATION_ID_REQUIRED`。
- `embedding/default` / `/v1/embed`、`rerank/default` / `/v1/rerank` 各返回 HTTP 503。
  属已确认的调用失败，具体根因未知；已向 [Atlas #147](https://github.com/vxture-foundation/vxture-atlas/issues/147) 提单。不能推断缺少模型授权。
- 原探针未记录 Atlas 失败请求编号／标准错误码，补丁增加仅白名单 code、状态、retryable 和 UUID 请求编号，
  不输出原始 message、provider 或请求正文；成功回执与失败分开，不以请求发出就计成功。
- 下一次优先分发业务相关企业补全 Skill，记录其对 SandBase／直接 Exa SDK 的依赖标记（仅布尔值），
  与实际 2 个连接器目录对照；不执行 Skill 里的外部调用或脚本，不把本地源文件当作生产分发证据。
- 向量／重排未恢复前，02A 可采用满足本人／同空间／来源／撤权条件的关键词和结构化检索；
  不能因此宣称语义记忆已验收，也不能用未测 quality 路由假装恢复。

当前 34 项诊断回归通过（Python 16、Node 18）；真实补充核验待本轮修正合并与运行。

## 三、证据口径

目录与调用分开；Skill 加载与执行分开；服务身份供给核验与交互式用户 OBO／业务写入验收分开。
使用固定公开研究材料，不读取私人聊天或客户正文，不新建／修改生产业务对象。
保留 taskId、callId、requestId、版本、路由、耗时、计量（平台未提供时记未知）、结果摘要与来源。
任何缺失、分页截断、协议异常或失败都明确标记，不输出凭据、原始异常、私人内容或环境值。

下表按本次真实目录和回执填写；目录、实调成功、已知失败及待后续质量验收分别标记。

## 四、任务映射与消费边界

| 任务 | 当前供给／状态 | 消费批次与限制 |
|---|---|---|
| 普通对话、研究摘要 | chat/default 已获授；本次探针 400，消费归属修正后待成功回执 | 01B／04A；不能宣称本批对话实调通过 |
| 复杂规划、结构化草稿、评分解释 | reasoning／extract／deterministic 已获授，尚未做任务样本 | 04A／05；金额、差额、进度继续由业务规则计算 |
| 记忆向量与重排 | 两类各 2 条已获授；default 各 503，quality 未测 | 02A；采用明确的关键词／结构化降级，保留隔离和撤权校验 |
| 公开检索、网页读取 | exa.web-research@1.0.0 两个 read 操作实调成功 | 04A；接入来源与表单草稿，联网不等于业务已保存 |
| 企业补全、市场研究、销售支持 Skill | 相关目录可发现／版本已解析；877 个 Skill 的依赖声明均为空 | 04A；业务样本分发及工具适配待核验，不信任 Skill 提供新权限 |
| 文档转 Markdown | markitdown.document-to-markdown@1.0.0 已解析 convert_to_markdown/read | 尚未实调；不等于已具备任意文档、OCR 或私有文件访问权限 |
| UUID 关联、保存、发布 | 本次不调用业务写入，执行器目录为空 | 04A 字段契约草稿、04B 原域服务／#652 授权，05 贯穿 |
