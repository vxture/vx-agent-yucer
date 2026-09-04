# -*- coding: utf-8 -*-
"""YC-101 系统架构."""

ANCHORS = [
    ("layers", "分层形态"),
    ("gates", "两道门"),
    ("planes", "两个智能体平面"),
    ("channels", "三条平台通道"),
    ("rigid", "刚性区与空白区"),
    ("jobs", "定时作业"),
]

LEDE = ("能力分区一致的分层、两道门的顺序与不对称、以及 yucer 与平台之间不可改的三条通道。"
        "结构本身就是约束——<strong>能画出来的越界路径，代码里就走不通</strong>。")

BODY = r"""
<section id="layers"><h2><span class="num">01</span>分层形态<span class="h2-meta">分区之间无例外</span></h2><div class="rule"></div>

<p>能力分区<strong>没有例外</strong>，全部是同一个形状。这不是整洁癖：形状一致意味着「这个域是怎么写的」不需要被问第二次，
也意味着任何绕过某一层的写法在评审时一眼可见。</p>

<div class="note warn"><strong>D9 产品目录目前只有前三层。</strong>
<span class='mono'>domains/catalog/</span> 有 <span class='mono'>store.ts</span>、
<span class='mono'>lib/</span> 与 Prisma 适配器，<strong>没有 <span class='mono'>service.ts</span></strong>——
也就是说它<strong>还没有两道门</strong>。ADR-017 已经把门的形状定下来（六条
<span class='mono'>feature: null</span> 的 action，三个权限），代码待补。
在补上之前，目录只能被读，不能经产品路径写。</div>

<div class="flow">
  <div class="flow-node n-blue"><div class="fn-name">service.ts</div><div class="fn-desc">两道门 → 规则纯函数 → 端口。<strong>唯一</strong>的写入入口。</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-violet"><div class="fn-name">lib/*.ts</div><div class="fn-desc">规则纯函数。无 IO、无门、可单测。</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-green"><div class="fn-name">store.ts</div><div class="fn-desc">端口 + 内存实现。<span class='mono'>workspace_id</span> 是每个方法的第一个参数。</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-amber"><div class="fn-name">prisma-store.ts</div><div class="fn-desc">适配器。写库<strong>前</strong>过列锁镜像。</div></div>
</div>

<div class="card">
  <div class="card-head"><span class="card-title">workspace_id 是第一个参数，不是上下文</span><span class="card-sub">端口设计</span></div>
  <p style='margin:0'>放进隐式上下文的隔离键，会在某个人忘记传的地方安静地跨工作区读数据。
  作为<strong>每个端口方法的第一个形参</strong>，忘记传是类型错误。</p>
</div>

<div class="card">
  <div class="card-head"><span class="card-title">列锁镜像：让数据库不是第一个说不的人</span><span class="card-sub">domains/shared/column-locks.ts</span></div>
  <p style='margin:0'><span class='mono'>column-locks.ts</span> 是 <span class='mono'>98_column_locks.sql</span> 的类型化镜像，
  <span class='mono'>column-locks.test.ts</span> 解析 DDL <strong>双向对账</strong>。适配器写库前校验补丁，
  把 <span class='mono'>permission denied for column ...</span> 变成调用点上的具名违规。
  <span class="lock db">数据库仍是兜底</span> —— 镜像可能过时，授权不会。</p>
</div>
</section>

<section id="gates"><h2><span class="num">02</span>两道门<span class="h2-meta">顺序与不对称</span></h2><div class="rule"></div>

<p>每一次读写都过两道门，<strong>顺序固定</strong>，且两种失败的处理方式<strong>刻意不同</strong>。</p>

<div class="gate">
  <div class="gate-step g1"><div class="gs-n">GATE 1</div><div class="gs-t">权益：工作区买了吗</div>
  <div class="gs-d">19 个功能键 × 5 档。判据由平台的 entitlement 给出，产品不自算。</div></div>
  <div class="gate-and">AND</div>
  <div class="gate-step g2"><div class="gs-n">GATE 2</div><div class="gs-t">权限：这个成员可以吗</div>
  <div class="gs-d">25 个权限 × 9 个角色 = 117 条授权，存在 <span class='mono'>local_authz</span>。</div></div>
  <div class="gate-and">▸</div>
  <div class="gate-step g3"><div class="gs-n">THEN</div><div class="gs-t">规则纯函数</div>
  <div class="gs-d">到这里才轮到业务判断。门不做业务，业务不做门。</div></div>
</div>

<div class="note info"><strong>两个公式，不是一个。</strong>
界面面 <span class='mono'>tier != null</span>；数据面 <span class='mono'>tier != null || bundled</span>。
数据面更松是有意的——降级的工作区必须仍能取回自己的数据，但产品表面不再点亮。
<span class="lock rule">刚性</span> 不得在本地放宽。</div>

<div class="tw"><table>
<thead><tr><th>失败</th><th>界面表现</th><th>为什么</th></tr></thead>
<tbody>
<tr><td><strong>权益缺口</strong></td><td><span class="tag t-warn">显示，标为需升级，给升级入口</span></td>
<td>一个没人看得见的功能是一个没人会买的功能</td></tr>
<tr><td><strong>权限缺口</strong></td><td><span class="tag t-dim">整条消失，不留痕迹</span></td>
<td>拿同事能开、你开不了的门吊着你，既无法行动，还泄漏了谁能做什么</td></tr>
</tbody></table></div>

<div class="note warn"><strong>这条不对称有一个可测的推论</strong>，<span class='mono'>navigation.ts</span> 靠它区分两种「什么都看不到」：
<span class='mono'>resolveNavigation()</span> 返回<strong>空列表</strong>意味着每一域都是被权限拒的——
而那只可能发生在权益已经通过之后，因为权益先判。所以「没订阅」和「没角色」能被分开，
<strong>而后者付再多钱也解决不了</strong>，把他送去付款页比什么都不说更糟。</div>
</section>

<section id="planes"><h2><span class="num">03</span>两个智能体平面<span class="h2-meta">ADR-004</span></h2><div class="rule"></div>

<p>yucer <strong>不托管模型、不自建能力执行器</strong>。两件事都向平台采购，各自只有一个出口。</p>

<div class="grid g2">
<div class="card"><div class="card-head"><span class="card-title">Atlas · 模型面</span><span class="card-sub">思考</span></div>
<div class="kv"><div class="kv-k hi">出口</div><div class="kv-v">agent/atlas</div></div>
<div class="kv"><div class="kv-k hi">路由依据</div><div class="kv-v">endpointCode（运营者的间接层）</div></div>
<div class="kv"><div class="kv-k hi">已知缺口</div><div class="kv-v txt">模型面<strong>没有版本列</strong>，只有 <span class='mono'>model_code</span> / <span class='mono'>is_active</span>。供应商换模型行为不产生任何信号——TD-004</div></div>
</div>
<div class="card"><div class="card-head"><span class="card-title">Runos · 能力面</span><span class="card-sub">行动</span></div>
<div class="kv"><div class="kv-k hi">出口</div><div class="kv-v">agent/runos</div></div>
<div class="kv"><div class="kv-k hi">形态</div><div class="kv-v">MCP 四工具</div></div>
<div class="kv"><div class="kv-k hi">边界</div><div class="kv-v txt">Skill <strong>只分发不执行</strong></div></div>
</div>
</div>

<div class="note danger"><strong>浮动别名是一笔在记的债。</strong>
<span class='mono'>resolve()</span> 与 <span class='mono'>load()</span> 全部落在默认值 <span class='key'>"stable"</span> 上，
而 <span class='mono'>stable</span> 是浮动的。运营者把它改指到另一个版本时，本仓行为随之改变——
<strong>没有代码变更、没有信号、没有测试变红</strong>。表现是「同样的问题昨天好好的今天不对了」，且无从归因。</div>
</section>

<section id="channels"><h2><span class="num">04</span>三条平台通道<span class="h2-meta">C1 / C2 / C3</span></h2><div class="rule"></div>

<p>全部继承自 <span class='mono'>vxture-template</span> 且<strong>刚性不可改</strong>：端点、签名、幂等、门控公式、缓存纪律。</p>

<div class="card"><div class="card-head"><span class="card-title">C1 · OIDC RP</span><span class="card-sub">身份</span></div>
<div class="kv"><div class="kv-k hi">客户端对</div><div class="kv-v">yucer / yucer-beta</div></div>
<div class="kv"><div class="kv-k hi">状态</div><div class="kv-v txt">通道通，等平台侧注册</div></div>
<div class="kv"><div class="kv-k hi">会话解析</div><div class="kv-v txt">服务端组件解析会话 → 权益 → 权限，<strong>客户端只拿结论</strong></div></div>
</div>

<div class="card"><div class="card-head"><span class="card-title">C2 · 权益与配额</span><span class="card-sub">商业</span></div>
<div class="kv"><div class="kv-k hi">能力矩阵</div><div class="kv-v">19 个功能键 × 5 档，累进</div></div>
<div class="kv"><div class="kv-k hi">裁定边界</div><div class="kv-v txt">档位判在平台层；<strong>谁能做什么判在产品层</strong></div></div>
</div>

<div class="card"><div class="card-head"><span class="card-title">C3 · 开通与用量</span><span class="card-sub">生命周期</span></div>
<div class="kv"><div class="kv-k hi">表</div><div class="kv-v">vx_provision 三张 · local_usage 两张</div></div>
<div class="kv"><div class="kv-k hi">凭证缓存键</div><div class="kv-v txt">曾用 <span class='key'>"|"</span> 拼接而<strong>不是单射的</strong>——
<span class='mono'>tenant "a|b"+ws "c"</span> 与 <span class='mono'>tenant "a"+ws "b|c"</span> 同键，一个工作区铸出的凭证会被交给另一个。测试第一次跑就红</div></div>
</div>
</section>

<section id="rigid"><h2><span class="num">05</span>刚性区与空白区<span class="h2-meta">模板契约</span></h2><div class="rule"></div>

<p>本仓由 <span class='mono'>vxture-template</span> 实例化而来。模板划出两个区，<strong>边界本身是刚性的</strong>。</p>

<div class="grid g2">
<div class="card"><div class="card-head"><span class="card-title">刚性区</span><span class="card-sub">不得偏离</span></div>
<ul style='margin-bottom:0'>
<li>治理外壳、CI/CD 键名与作业名</li>
<li>三通道端点 / 签名 / 幂等 / 门控公式 / 缓存纪律</li>
<li>DB 治理：DDL 三段式 + 列锁 + <span class='mono'>db-init</span> 是唯一结构变更路径</li>
<li>文档编号；数据面硬约束</li>
<li>产品 UI 只取自 <span class='mono'>@vxture/design-system</span></li>
</ul>
</div>
<div class="card"><div class="card-head"><span class="card-title">空白区 · yucer 已填</span><span class="card-sub">改动需 ADR</span></div>
<div class="kv"><div class="kv-k hi">产品定义</div><div class="kv-v txt">九个能力分区 D1–D9，按对象归属切</div></div>
<div class="kv"><div class="kv-k hi">域 schema</div><div class="kv-v txt">五个 + 证据面 + 目录面</div></div>
<div class="kv"><div class="kv-k hi">能力矩阵</div><div class="kv-v txt">19 键 × 5 档</div></div>
<div class="kv"><div class="kv-k hi">角色目录</div><div class="kv-v txt">25 权限 / 9 角色 / 117 授权</div></div>
</div>
</div>

<div class="note info"><strong>标准的缺口先在平台仓修。</strong>
CLAUDE.md 明确规定不得在产品仓内自造标准——这就是 TD-002（界面文案违反 source ASCII-only）
<strong>只登记、不裁定</strong>的原因，而不是拖延。</div>
</section>

<section id="jobs"><h2><span class="num">06</span>定时作业<span class="h2-meta">ADR-010</span></h2><div class="rule"></div>

<p>定时器在<strong>平台侧且唯一</strong>，产品侧只提供幂等的作业体。</p>

<div class="card"><div class="card-head"><span class="card-title">逾期承诺扫描</span><span class="card-sub">TD-003 · 已知竞态</span></div>
<p><span class='mono'>runCommitmentSweep</span> 先读「已在队列中待裁决」的提案做去重，再写新提案。
中间<strong>没有事务、没有锁</strong>，数据库也没有约束能兜底。</p>
<p style='margin:0'>两次并发扫描各自读到空集，双双建单：两条逾期承诺变成四条提案，
而<strong>两份账目都报 <span class='mono'>{overdue:2, proposed:2, alreadyQueued:0}</span></strong>，看起来都很干净。
这是那轮自审里唯一一条「两边都不报错」的缺陷。</p>
</div>

<div class="note warn"><strong>修法是一条部分唯一索引，不是应用层加锁。</strong>
<span class='mono'>WHERE status = 'proposed'</span> 这一半是关键——全量唯一索引会让人工拒绝之后
<strong>再也无法就同一条承诺重新提案</strong>，而那正是这个作业最该做的事：承诺还欠着，就该再问一次。
应用层锁在两个副本下是错的，还会给出一种已经解决了的错觉。</div>
</section>
"""

FOOT = "Vxture Yucer 文档体系 · 系统架构 YC-101 · 事实截至 2026-08-26"
