# -*- coding: utf-8 -*-
"""YC-301 数据结构."""

ANCHORS = [
    ("schemas", "十个 schema"),
    ("owner", "一个对象一个归属域"),
    ("hard", "四条硬约束"),
    ("locks", "列锁"),
    ("incr", "增量与守卫"),
    ("nulls", "NULL 与唯一索引"),
]

LEDE = ("44 张表跨 10 个 schema。<strong>本产品的业务规矩不是约定，是授权和列锁</strong>——"
        "违反它们在运行时失败，不在评审时。这份文档说明哪条规矩由哪个机制撑着。")

SCHEMAS = [
    ("yucer_pipeline", 7, "D5+D6", "signal / lead / opportunity / opportunity_stage_event / opportunity_line / forecast_snapshot / win_loss_review"),
    ("yucer_gtm", 6, "D1+D2+D3", "strategy_plan / market_segment / territory / sales_target / campaign / campaign_execution"),
    ("yucer_core", 5, "D4", "account / contact / account_relation / account_plan / offering"),
    ("yucer_agent", 5, "D8", "agent_session / agent_message / agent_action / agent_playbook / judgement_snooze"),
    ("yucer_delivery", 4, "D7", "project / project_milestone / project_task / revenue_schedule"),
    ("yucer_catalog", 4, "D9 产品目录", "product / solution / solution_item / price_book_entry"),
    ("yucer_field", 3, "证据面", "interaction / interaction_participant / commitment"),
    ("local_authz", 5, "平台面 · 保留名", "member / role / permission / member_role / role_permission"),
    ("vx_provision", 3, "平台面 · 保留名", "app_instance / provision_seq / webhook_delivery"),
    ("local_usage", 2, "平台面 · 保留名", "raw / checkpoint"),
]

LEDE_TAIL = ""


def _schema_table():
    rows = []
    for name, n, dom, tables in SCHEMAS:
        reserved = "保留名" in dom
        cls = ' style="color:var(--text-dim)"' if reserved else ''
        rows.append('<tr%s><td class="mono">%s</td><td class="num">%d</td><td>%s</td>'
                    '<td class="mono" style="font-size:12px;color:var(--text-dim)">%s</td></tr>'
                    % (cls, name, n, dom, tables))
    return ('<div class="tw"><table><thead><tr><th>schema</th><th class="num">表</th>'
            '<th>归属</th><th>表名</th></tr></thead><tbody>%s'
            '<tr style="border-top:2px solid var(--border)"><td><strong>合计</strong></td>'
            '<td class="num"><strong>44</strong></td><td colspan="2"></td></tr>'
            '</tbody></table></div>' % "".join(rows))


BODY = r"""
<section id="schemas"><h2><span class="num">01</span>十个 schema<span class="h2-meta">ADR-002</span></h2><div class="rule"></div>

<p>九个能力分区<strong>没有映射到九个 schema</strong>，这是 ADR-002 的裁定。
域是<strong>对象归属</strong>的单位，schema 是<strong>授权</strong>的单位，两者本来就不是一回事——
硬凑成一一对应，只会得到几个只有一张表的 schema 和一套没人记得住的前缀。</p>

__SCHEMAS__

<div class="note info">三个 <span class='key'>local_*</span> / <span class='key'>vx_*</span> 名字是模板的<strong>保留名</strong>，
产品不得占用也不得改动。它们承载三条平台通道的落地（见 <span class='mono'>YC-101</span> 第 04 节），
本产品只读写自己那 34 张。</div>

<div class="note ok"><span class='mono'>yucer_field</span>（证据面）与 <span class='mono'>yucer_catalog</span>（目录面）
是<strong>后加的两个 schema</strong>，各由一次增量引入。它们没有被塞进已有的五个里，理由与上面同一条：
证据的授权边界和商机的授权边界不同，合并会让「谁能写跟进记录」和「谁能改商机」变成同一个问题。</div>
</section>

<section id="owner"><h2><span class="num">02</span>一个对象一个归属域<span class="h2-meta">ADR-001</span></h2><div class="rule"></div>

<p>这是本产品最上层的数据规矩，也是唯一一条<strong>不需要机制就能自我执行</strong>的：
只要每张表落在归属域的 schema 里，跨域写入就必须显式跨 schema，而那在代码评审里一眼可见。</p>

<div class="tw"><table>
<thead><tr><th>对象</th><th>归属</th><th>谁只读引用它</th></tr></thead>
<tbody>
<tr><td class="mono">account</td><td>D4</td><td>D2 配额作用域 · D5 信号归因 · D6 商机 · D7 项目</td></tr>
<tr><td class="mono">opportunity</td><td>D6</td><td>D7 项目来源 · D8 提案主体 · D3 战役回报</td></tr>
<tr><td class="mono">campaign</td><td>D3</td><td>D5 信号归因 · D6 商机归因</td></tr>
<tr><td class="mono">interaction</td><td>证据面</td><td>D4 健康度 · D6 停滞判断 · D8 引用原文</td></tr>
</tbody></table></div>

<div class="note warn"><strong>只读引用不等于外键随便建。</strong>
跨 schema 的引用列是<strong>归因键</strong>，而归因键一旦写下就<strong>不可变</strong>——见下一节第二条。</div>
</section>

<section id="hard"><h2><span class="num">03</span>四条硬约束<span class="h2-meta">yucer 自己的刚性</span></h2><div class="rule"></div>

<p>这四条是产品域自己的规矩。每一条都标出<strong>由什么撑着</strong>——
「我们约好不这么做」和「数据库拒绝」是完全不同的保证。</p>

<div class="card"><div class="card-head"><span class="card-title">一 · 追加表没有 UPDATE 授权</span>
<span class="card-sub"><span class="lock db">授权</span></span></div>
<p><span class='mono'>account_relation</span> · <span class='mono'>opportunity_stage_event</span> ·
<span class='mono'>forecast_snapshot</span> · <span class='mono'>agent_message</span> ——
服务角色<strong>根本没有</strong> UPDATE 权限。更正的方式是写一条新行。</p>
<p style='margin:0'>为什么是 <span class='mono'>forecast_snapshot</span>：预测准确率是期末实际对<strong>期初快照</strong>，
一个可改写的快照使这个数字永远算不出来，而且没人会发现它算错了。</p></div>

<div class="card"><div class="card-head"><span class="card-title">二 · 归因键创建后冻结</span>
<span class="card-sub"><span class="lock db">列锁</span></span></div>
<p><span class='mono'>lead.signal_id</span> · <span class='mono'>lead.campaign_id</span> ·
<span class='mono'>opportunity.campaign_id</span> · <span class='mono'>opportunity.account_id</span>，
以及 <span class='mono'>signal</span> 上<strong>每一个证据列</strong>。</p>
<p style='margin:0'>更正归因是一次<strong>数据订正</strong>，走 <span class='mono'>db-init</span>，永远不是应用写入。
理由是「这条商机当初是从哪来的」是被用来评价市场投放的事实——
一个能被后来的人改的归因数字，评价不了任何东西。</p></div>

<div class="card"><div class="card-head"><span class="card-title">三 · 智能体提议，人裁决</span>
<span class="card-sub"><span class="lock db">列锁</span> + <span class="lock rule">规则</span></span></div>
<p style='margin:0'><span class='mono'>agent_action.payload</span> / <span class='mono'>rationale</span> /
<span class='mono'>confidence</span> 不可变；<span class='key'>accepted</span> 要求
<span class='mono'>decided_by_sub</span> 非空。见 ADR-003。</p></div>

<div class="card"><div class="card-head"><span class="card-title">四 · 承诺不能靠断言关闭</span>
<span class="card-sub"><span class="lock db">CHECK</span> + <span class="lock rule">规则</span></span></div>
<p><span class='key'>met</span> 必须指向一次真实交互——数据库
<span class='mono'>chk_commitment_met_needs_evidence</span> 与规则层双重把守。</p>
<p style='margin:0'><strong><span class='key'>missed</span> 什么都不需要。</strong>
成功要有证据，失败是「什么都没发生」时自然的结果——对称地要求两者都举证，
只会让人为了关闭一条记录去编一次接触。</p></div>

<div class="note danger"><strong>加一个可写的域列，必须同时改 <span class='mono'>98_column_locks.sql</span>，
否则服务角色写入报 permission denied。那个失败就是设计。</strong>
它把「有人加了列却没想过谁能改它」从一个没人会做的评审动作，变成一次必然发生的运行时失败。</div>
</section>

<section id="locks"><h2><span class="num">04</span>列锁<span class="h2-meta">98_column_locks.sql</span></h2><div class="rule"></div>

<p>机制是两步，对每张表都一样：</p>

<div class="flow">
  <div class="flow-node n-red"><div class="fn-name">REVOKE UPDATE</div><div class="fn-desc">先把整张表的 UPDATE 收回。默认是<strong>什么都不能改</strong>。</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-green"><div class="fn-name">GRANT UPDATE (列白名单)</div><div class="fn-desc">再逐列放行。锚列——<span class='mono'>id</span>、引用键、<span class='mono'>created_at</span>——<strong>永不可写</strong>。</div></div>
</div>

<div class="card"><div class="card-head"><span class="card-title">类型化镜像与双向对账</span><span class="card-sub">domains/shared/column-locks.ts</span></div>
<p><span class='mono'>column-locks.ts</span> 是这份 SQL 的类型化镜像，
<span class='mono'>column-locks.test.ts</span> <strong>解析 DDL 双向对账</strong>：
SQL 里有而镜像里没有会红，镜像里有而 SQL 里没有也会红。</p>
<p style='margin:0'>适配器在写库<strong>前</strong>用镜像校验补丁，把
<span class='mono'>permission denied for column ...</span> 变成调用点上的具名违规。
<span class="lock db">数据库仍是兜底</span>——镜像可能过时，授权不会。</p></div>
</section>

<section id="incr"><h2><span class="num">05</span>增量与守卫<span class="h2-meta">db-init 是唯一路径</span></h2><div class="rule"></div>

<p>结构变更<strong>只能</strong>经 <span class='mono'>db-init</span>，DDL 分三段并按固定顺序执行：</p>

<div class="gate">
  <div class="gate-step g1"><div class="gs-n">00</div><div class="gs-t">baseline</div>
  <div class="gs-d">基线建表。幂等。</div></div>
  <div class="gate-and">▸</div>
  <div class="gate-step g2"><div class="gs-n">97 / 98</div><div class="gs-t">服务角色与列锁</div>
  <div class="gs-d">授权与列级白名单。</div></div>
  <div class="gate-and">▸</div>
  <div class="gate-step g3"><div class="gs-n">incr/*</div><div class="gs-t">编号增量</div>
  <div class="gs-d">追加，永不改写。当前 0001–0009。</div></div>
</div>

<div class="note danger"><strong>顺序是有原因的，而且踩过。</strong>
增量跑在 97/98 <strong>之后</strong>，所以增量建的表<strong>必须自带授权和列锁</strong>——
写在 98 里会对着一张还不存在的表执行。<span class='mono'>check-incr-grants.mjs</span> 守这一条：
增量建表不自带授权，守卫红。</div>

<div class="tw"><table>
<thead><tr><th>增量</th><th>带来了什么</th></tr></thead>
<tbody>
<tr><td class="mono">0001</td><td>角色权限目录种子</td></tr>
<tr><td class="mono">0002</td><td><span class='mono'>strategy.approve</span> —— 批准计划不是编辑计划（ADR-005）</td></tr>
<tr><td class="mono">0003</td><td>两个作用域唯一索引改建为 <span class='key'>NULLS NOT DISTINCT</span>——见下一节</td></tr>
<tr><td class="mono">0004</td><td>证据面三张表，自带授权与列锁（ADR-006）</td></tr>
<tr><td class="mono">0005</td><td>判断暂缓</td></tr>
<tr><td class="mono">0006</td><td><span class='mono'>account.tier</span> 与 <span class='mono'>account_plan</span>（ADR-013）</td></tr>
<tr><td class="mono">0007</td><td><span class='mono'>yucer_catalog</span> 四表 + <span class='mono'>opportunity_line</span>（ADR-014）</td></tr>
<tr><td class="mono">0008</td><td>提案的能力键——按能力标注，不按智能体身份（ADR-015）</td></tr>
<tr><td class="mono">0009</td><td>招标信号的定向字段（ADR-016）</td></tr>
</tbody></table></div>
</section>

<section id="nulls"><h2><span class="num">06</span>NULL 与唯一索引<span class="h2-meta">incr/0003</span></h2><div class="rule"></div>

<p>这一节单独存在，因为它是本仓迄今<strong>最贵的一个缺陷</strong>，而且在 788 个绿灯下活了很久。</p>

<div class="card"><div class="card-head"><span class="card-title">缺陷</span><span class="card-sub">uidx_sales_target_scope · uidx_forecast_snapshot_scope_at</span></div>
<p style='margin:0'>两个唯一索引建在<strong>可空列</strong>上。Postgres 的 UNIQUE 把 <span class='key'>NULL</span> 视为<strong>互不相同</strong>，
所以这两个约束<strong>对工作区级的行完全失效</strong>——而工作区级正是其他所有数字的基准作用域。
同一个工作区可以有任意多条「工作区级目标」，达成度取哪一条是随机的。</p></div>

<div class="note warn"><strong>内存适配器建模不了这件事，所以单测抓不到。</strong>
唯一索引、CHECK、REVOKE 和 NULL 比较都是<strong>数据库的性质</strong>。
这就是为什么必须先建真数据库通道（<span class='mono'>db-contract</span> job，postgres:18 按
<span class='mono'>db-init.yml</span> 的同一顺序跑真 DDL）<strong>再</strong>修适配器缺陷——
反过来做就是在猜。</div>

<div class="card"><div class="card-head"><span class="card-title">同一轮抓到的另外两条</span><span class="card-sub">都只有对着真库才现形</span></div>
<p><strong>用 <span class='mono'>count()</span> 分配编号</strong>：三处注释都声称「放在事务里所以安全」。
事务给的是<strong>原子性不是串行化</strong>——READ COMMITTED 下两个并发事务读到同一个 count。
改用 <span class='mono'>pg_advisory_xact_lock</span>，按分配种类和作用域双重分键。</p>
<p style='margin:0'><strong>裸 <span class='mono'>catch</span></strong>：<span class='mono'>recordSignal</span> 把外键与 CHECK 失败
一律报成「已存在」。一个把所有失败翻译成同一句话的错误处理，等于没有错误处理。</p></div>

<div class="note ok"><strong>通道在它自己第一次运行里就抓到三个新写的缺陷</strong>——
CHECK 测试的两条断言因 Postgres 事务中止语义而实际无效（约束删掉照样绿）、硬编码容器口令、
安装未禁用生命周期脚本。<strong>一个不会为它守护的 bug 变红的测试，不是测试。</strong></div>
</section>
"""


def render():
    return BODY.replace("__SCHEMAS__", _schema_table())


FOOT = "Vxture Yucer 文档体系 · 数据结构 YC-301 · 44 表 / 10 schema / 9 个增量，事实截至 2026-08-26"
