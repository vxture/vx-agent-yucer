# -*- coding: utf-8 -*-
"""YC-201 能力登记册. The matrix is GENERATED from the same shape as the source."""

ANCHORS = [
    ("levels", "三层是什么关系"),
    ("two", "两份目录，不是一份"),
    ("matrix", "能力矩阵"),
    ("perms", "权限与角色"),
    ("grid", "授权网格"),
    ("edges", "边界情形"),
]

LEDE = ("九个能力分区、19 个功能键、24 个权限、五个功能域——四个数字，三层含义。"
        "<strong>先说清楚它们的关系，否则后面每一张表都会被读成同一件事。</strong>")

# --- source of truth, transcribed from portals/app/app/entitlement/capability.ts
FEATURES = [
    ("D1", "strategy.plan",        "市场战略"),
    ("D1", "strategy.segment",     "细分市场"),
    ("D2", "planning.target",      "目标配额"),
    ("D2", "planning.territory",   "销售区域"),
    ("D3", "campaign.manage",      "战役管理"),
    ("D3", "campaign.execute",     "战役执行"),
    ("D4", "account.manage",       "客户管理"),
    ("D4", "account.graph",        "关系图"),
    ("D5", "signal.inbox",         "信号收件箱"),
    ("D5", "signal.autoscore",     "自动评分"),
    ("D5", "signal.external_feed", "外部信号源"),
    ("D6", "pipeline.manage",      "商机管理"),
    ("D6", "pipeline.forecast",    "预测"),
    ("D6", "pipeline.winloss",     "赢丢复盘"),
    ("D7", "delivery.project",     "交付项目"),
    ("D7", "delivery.revenue",     "回款"),
    ("D8", "copilot.ask",          "提问"),
    ("D8", "copilot.suggest",      "主动提议"),
    ("D8", "copilot.autopilot",    "常授权执行"),
]
TIERS = ["free", "starter", "pro", "business", "enterprise"]
FREE = ["account.manage", "pipeline.manage", "copilot.ask"]
STARTER = FREE + ["signal.inbox", "campaign.manage", "delivery.project"]
PRO = STARTER + ["planning.target", "planning.territory", "account.graph",
                 "signal.autoscore", "pipeline.forecast", "copilot.suggest"]
BUSINESS = PRO + ["strategy.plan", "strategy.segment", "campaign.execute",
                  "signal.external_feed", "pipeline.winloss", "delivery.revenue"]
ENTERPRISE = BUSINESS + ["copilot.autopilot"]
BY_TIER = {"free": FREE, "starter": STARTER, "pro": PRO,
           "business": BUSINESS, "enterprise": ENTERPRISE}

ROLES = ["sales_leader", "marketing_manager", "sales_rep", "presales",
         "delivery_manager", "sales_ops", "viewer"]
ROLE_CN = {"sales_leader": "销售负责人", "marketing_manager": "市场经理",
           "sales_rep": "销售代表", "presales": "售前顾问",
           "delivery_manager": "交付经理", "sales_ops": "销售运营", "viewer": "只读成员"}
# ARRIVAL ORDER, mirroring PERM_CODES exactly - strategy.approve last because
# it came in by increment (incr/0002). Transcribing it into the D1 group for
# tidiness is precisely what section 04 of this document warns against, and the
# verifier caught me doing it.
PERMS = ["strategy.read", "strategy.write",
         "planning.read", "planning.write", "campaign.read", "campaign.write",
         "account.read", "account.write", "signal.read", "signal.triage",
         "pipeline.read", "pipeline.write", "pipeline.forecast",
         "delivery.read", "delivery.write",
         "copilot.use", "copilot.decide", "copilot.autopilot", "admin.manage",
         "strategy.approve",
         # incr/0010, ADR-017 - the catalogue partition. No feature key, so
         # these three are the ONLY gate it has.
         "catalog.read", "catalog.write", "catalog.price",
         # incr/0011, ADR-018 - recording is not editing.
         "account.record"]
GRANTS = {
    "sales_leader": ["strategy.read", "strategy.write", "strategy.approve", "planning.read",
                     "planning.write", "campaign.read", "campaign.write", "account.read",
                     "account.write", "signal.read", "signal.triage", "pipeline.read",
                     "pipeline.write", "pipeline.forecast", "delivery.read", "delivery.write",
                     "copilot.use", "copilot.decide", "copilot.autopilot", "admin.manage", "catalog.read", "catalog.write", "catalog.price", "account.record"],
    "marketing_manager": ["strategy.read", "strategy.write", "campaign.read", "campaign.write",
                          "signal.read", "signal.triage", "account.read", "pipeline.read",
                          "copilot.use", "copilot.decide", "catalog.read", "account.record"],
    "sales_rep": ["account.read", "account.write", "signal.read", "signal.triage",
                  "pipeline.read", "pipeline.write", "delivery.read", "campaign.read",
                  "copilot.use", "copilot.decide", "catalog.read", "account.record"],
    "presales": ["account.read", "account.write", "pipeline.read", "delivery.read", "copilot.use", "catalog.read", "account.record"],
    "delivery_manager": ["delivery.read", "delivery.write", "account.read", "pipeline.read",
                         "copilot.use", "copilot.decide", "catalog.read", "account.record"],
    "sales_ops": ["planning.read", "planning.write", "pipeline.read", "pipeline.forecast",
                  "account.read", "campaign.read", "strategy.read", "admin.manage", "copilot.use", "catalog.read", "catalog.write", "catalog.price"],
    "viewer": ["strategy.read", "planning.read", "campaign.read", "account.read",
               "signal.read", "pipeline.read", "delivery.read", "copilot.use", "catalog.read"],
}


D_CN = {
    "strategy": "D1 市场销售战略", "planning": "D2 销售规划", "campaign": "D3 市场执行",
    "account": "D4 客户管理", "signal": "D5 商机侦探", "pipeline": "D6 商机管理",
    "delivery": "D7 项目落地", "copilot": "D8 销售智能助手",
    "catalog": "D9 产品目录",
}
# Which functional domain the partition's PAGE was filed under. Navigation only -
# see YC-401. copilot is deliberately in none of the five.
IN_FD = {
    "strategy": "战略武备域", "planning": "兵力部署域", "campaign": "火力侦察域",
    "signal": "火力侦察域", "account": "阵地经营域", "pipeline": "阵地经营域",
    "delivery": "战果结算域", "copilot": "—— 横切，不在五域中",
    "catalog": "战略武备域",
}


def _levels():
    from collections import defaultdict
    keys, perms = defaultdict(list), defaultdict(list)
    for _, k, _cn in FEATURES:
        keys[k.split(".")[0]].append(k)
    for p in PERMS:
        perms[p.split(".")[0]].append(p)
    rows = []
    for d, cn in D_CN.items():
        # A partition with no feature key is not an error, it is the D9 design -
        # marked so the reader sees the one exception rather than an empty cell.
        hi = ' style="color:var(--accent4)"' if not keys[d] else ''
        rows.append(
            '<tr><td%s><strong>%s</strong></td>'
            '<td class="num"%s>%d</td><td class="mono" style="font-size:12px;color:var(--text-dim)">%s</td>'
            '<td class="num">%d</td><td class="mono" style="font-size:12px;color:var(--text-dim)">%s</td>'
            '<td style="color:var(--text-mid)">%s</td></tr>'
            % (hi, cn, hi, len(keys[d]), " ".join(x.split(".")[1] for x in keys[d]),
               len(perms[d]), " ".join(x.split(".")[1] for x in perms[d]), IN_FD[d]))
    rows.append('<tr style="border-top:2px solid var(--border)">'
                '<td style="color:var(--text-dim)">不属于任何分区</td>'
                '<td class="num">0</td><td></td>'
                '<td class="num">1</td><td class="mono" style="font-size:12px">admin.manage</td>'
                '<td style="color:var(--text-mid)">—— 从齿轮进，不在五域中</td></tr>')
    rows.append('<tr style="border-top:1px solid var(--border)"><td><strong>合计</strong></td>'
                '<td class="num"><strong>%d</strong></td><td></td>'
                '<td class="num"><strong>%d</strong></td><td></td><td></td></tr>'
                % (len(FEATURES), len(PERMS)))
    return ('<div class="tw"><table><thead><tr><th>能力分区 D1–D9</th>'
            '<th class="num">功能键</th><th></th><th class="num">权限</th><th></th>'
            '<th>页面归入的功能域</th></tr></thead><tbody>%s</tbody></table></div>'
            % "".join(rows))

def _matrix():
    rows = []
    prev_d = None
    for d, key, cn in FEATURES:
        cells = "".join(
            '<td class="cell %s">%s</td>' % (("on", "●") if key in BY_TIER[t] else ("off", "·"))
            for t in TIERS)
        dom = ('<td class="mono" style="color:var(--text-dim)">%s</td>' % d) if d != prev_d else '<td></td>'
        prev_d = d
        rows.append('<tr>%s<td class="feat">%s</td><td style="color:var(--text-mid)">%s</td>%s</tr>'
                    % (dom, key, cn, cells))
    head = "".join('<th class="tier">%s</th>' % t for t in TIERS)
    counts = "".join('<td class="cell" style="color:var(--text-dim);font-size:11px">%d</td>'
                     % len(BY_TIER[t]) for t in TIERS)
    return ('<div class="mx"><table><thead><tr><th></th><th>功能键</th><th></th>%s</tr></thead>'
            '<tbody>%s<tr><td></td><td colspan="2" style="color:var(--text-dim)">累计</td>%s</tr>'
            '</tbody></table></div>' % (head, "".join(rows), counts))


def _grid():
    head = "".join('<th class="tier">%s</th>' % ROLE_CN[r] for r in ROLES)
    rows = []
    prev = None
    for p in PERMS:
        dom = p.split(".")[0]
        cells = "".join('<td class="cell %s">%s</td>'
                        % (("on", "●") if p in GRANTS[r] else ("off", "·")) for r in ROLES)
        sep = ' style="border-top:1px solid var(--border)"' if dom != prev else ''
        prev = dom
        rows.append('<tr%s><td class="feat">%s</td>%s</tr>' % (sep, p, cells))
    counts = "".join('<td class="cell" style="color:var(--text-dim);font-size:11px">%d</td>'
                     % len(GRANTS[r]) for r in ROLES)
    return ('<div class="mx"><table><thead><tr><th>权限</th>%s</tr></thead><tbody>%s'
            '<tr style="border-top:2px solid var(--border)"><td style="color:var(--text-dim)">合计 84</td>%s</tr>'
            '</tbody></table></div>' % (head, "".join(rows), counts))


BODY = r"""
<section id="levels"><h2><span class="num">01</span>三层是什么关系<span class="h2-meta">先读这一节</span></h2><div class="rule"></div>

<p>四个数字容易被读成同一件事，其实是<strong>三层</strong>，而且只有中间那层是卖钱的。</p>

<div class="flow">
  <div class="flow-node n-violet"><div class="fn-name">九个能力分区 D1–D9</div>
  <div class="fn-desc"><strong>命名空间</strong>。按业务对象所有权切（ADR-001）。它自己不卖钱、也不授权——
  它是下面两份目录<strong>共用的前缀</strong>。其中 <strong>D9 只出现在右边那份</strong>。</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div>
  <div class="flow-arrow-label">前缀</div></div>
  <div class="flow-node n-amber"><div class="fn-name">19 个功能键</div>
  <div class="fn-desc"><strong>售卖单位</strong>。<span class='key'>&lt;分区&gt;.&lt;功能&gt;</span>。
  五个档位就是它的五个累进子集。</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div>
  <div class="flow-arrow-label">前缀</div></div>
  <div class="flow-node n-blue"><div class="fn-name">24 个权限</div>
  <div class="fn-desc"><strong>组织内单位</strong>。同样以分区为前缀，但<strong>与功能键无一一对应</strong>。</div></div>
</div>

<div class="note danger"><strong>五个功能域不在这条链上，一格都不在。</strong>
它是对<strong>路由</strong>的另一种分组，只服务导航：不拥有任何数据、不出现在任何键名里、
不参与任何一道门。它 2026-08-20 才引入，比上面三层晚了半年。切法与命名见 <span class='mono'>YC-401</span> 第 03 节。</div>

__LEVELS__

<h3>你问的那个问题：五档按什么授权</h3>

<div class="card"><div class="card-head"><span class="card-title">按功能键，不按权限</span>
<span class="card-sub">CAPABILITY_MATRIX: Record&lt;Tier, FeatureKey[]&gt;</span></div>
<p>类型签名就是答案：一个档位<strong>就是一组功能键</strong>。19 个键，五个累进子集，
<span class='mono'>3 → 6 → 12 → 18 → 19</span>。</p>
<p style='margin:0'><strong>权限完全不参与售卖。</strong>它回答的是「这个工作区里，这个人能做什么」，
由工作区管理员分配，与付了多少钱无关。一个免费档的工作区照样可以有七种角色；
一个企业档的工作区照样可以有一个什么都不能改的只读成员。</p></div>

<div class="note warn"><strong>两份目录不是一一对应，逐分区看就对不上。</strong>
D5 商机侦探有 3 个键却只有 2 个权限；D1 市场销售战略有 2 个键却有 3 个权限。
它们是<strong>同一批分区上的两种颗粒度</strong>，把它们对齐是错的。</div>

<div class="note danger"><strong>D9 产品目录：一个分区，零功能键（ADR-017）。</strong>
它拥有四张表，所以按 ADR-001 的判据（一个对象只有一个归属分区）它必须是分区；
但它<strong>不是一项可售卖的能力</strong>——不知道自己卖什么就没法卖任何东西，
所以 19 个键里没有它，它的 action 全部 <span class='mono'>feature: null</span>。
<br><br><strong>于是权限成了它唯一的门</strong>，这也是它有三个权限而不是两个的原因：
<span class='mono'>catalog.price</span> 单独管底价。
<span class='mono'>pricing.ts</span> 已经在算「低于底价要签字」——
<strong>能移动底价的人，等于能在不批准任何东西的情况下批准每一笔折扣</strong>。
刻意不给 <span class='mono'>sales_rep</span>：底价存在的意义就是约束正在成交的那个人。</div>

<div class="note ok"><strong>唯一不属于任何分区的权限仍是 <span class='mono'>admin.manage</span>，
而后台管理也不属于任何一个功能域</strong>——从齿轮图标进。
两层各自独立做出的判断落在了同一个地方：<strong>管理不是业务</strong>。
它既不是一个可售卖的能力，也不是一个你要去的战场。
<br><br>D9 与它的差别正在这里：目录同样不可售卖，但它<strong>拥有对象</strong>，
所以是分区；<span class='mono'>admin</span> 一张表都不拥有，所以不是。
<strong>「不带功能键」说的是怎么卖，「拥有对象」才是为什么是分区。</strong></div>
</section>

<section id="two"><h2><span class="num">02</span>两份目录，不是一份<span class="h2-meta">ADR-001</span></h2><div class="rule"></div>

<p>把两者混成一份是这个产品最容易犯、也最贵的错。它们回答的问题不同：</p>

<div class="grid g2">
<div class="card"><div class="card-head"><span class="card-title">能力矩阵</span><span class="card-sub">商业包装面</span></div>
<div class="kv"><div class="kv-k hi">回答</div><div class="kv-v txt">这个<strong>工作区</strong>买了什么</div></div>
<div class="kv"><div class="kv-k hi">规模</div><div class="kv-v">19 键 × 5 档，累进</div></div>
<div class="kv"><div class="kv-k hi">住在</div><div class="kv-v">entitlement/capability.ts</div></div>
<div class="kv"><div class="kv-k hi">谁配置</div><div class="kv-v txt">平台<strong>从不</strong>配置功能键——这是产品知识</div></div>
</div>
<div class="card"><div class="card-head"><span class="card-title">角色权限目录</span><span class="card-sub">组织内权限面</span></div>
<div class="kv"><div class="kv-k hi">回答</div><div class="kv-v txt">这个<strong>成员</strong>可以做什么</div></div>
<div class="kv"><div class="kv-k hi">规模</div><div class="kv-v">20 权限 × 7 角色 = 68 授权</div></div>
<div class="kv"><div class="kv-k hi">住在</div><div class="kv-v">local_authz 五张表</div></div>
<div class="kv"><div class="kv-k hi">谁配置</div><div class="kv-v txt">工作区管理员，通过 <span class='mono'>/admin/members</span></div></div>
</div>
</div>

<div class="note info">功能键按能力分区命名空间：<span class='key'>&lt;domain&gt;.&lt;feature&gt;</span>，
域前缀取自能力分区——但<strong>功能键只覆盖 D1–D8</strong>，D9 目录一个键都没有（ADR-017）。这让「买了什么」和「做了什么」在读日志时能对上，但<strong>两个命名空间刻意不重合</strong>——
<span class='mono'>pipeline.forecast</span> 在两份目录里都存在<strong>且含义不同</strong>：
一个是「这个档位卖不卖预测」，一个是「这个人能不能提交预测」。</div>
</section>

<section id="matrix"><h2><span class="num">03</span>能力矩阵<span class="h2-meta">19 × 5</span></h2><div class="rule"></div>

<p>档位<strong>累进</strong>：每一档把上一档整个展开进来，不是查表时继承。
<span class='mono'>canUseFeature</span> 做的是<strong>平铺 <span class='mono'>includes</span></strong>，
所以数组必须是完整的——用展开构建正是保证这一点的手段。</p>

__MATRIX__

<div class="note ok"><strong>填充区必须是阶梯形。</strong>
这不是排版效果，是一条可看见的不变量：累进意味着任何一行一旦点亮就不会再熄灭。
矩阵里出现一个孤岛或一个缺口，说明有人手写了某一档而没有展开上一档。</div>

<h3>每一档在卖什么</h3>
<div class="tw"><table>
<thead><tr><th>档</th><th class="num">键</th><th>这一档的主张</th></tr></thead>
<tbody>
<tr><td class="mono">free</td><td class="num">3</td><td>够把核心循环手工跑起来：客户、商机、问助手</td></tr>
<tr><td class="mono">starter</td><td class="num">6</td><td>需求进、交付出——全链路骨架，仍靠人推</td></tr>
<tr><td class="mono">pro</td><td class="num">12</td><td>管理层：对着配额规划、做预测、让助手提议下一步</td></tr>
<tr><td class="mono">business</td><td class="num">18</td><td>战略到落地的闭环，含<strong>学习闭环</strong>（赢丢复盘）</td></tr>
<tr><td class="mono">enterprise</td><td class="num">19</td><td>助手<strong>在常授权下执行</strong>已采纳的动作</td></tr>
</tbody></table></div>

<div class="note danger"><strong>证据面在免费档，而这是一次裁定，不是疏忽（ADR-018）。</strong>
ADR-006 曾写明要给它两个功能键，一个都没加；19 键冻结后，缺口转成了显式裁定：
<strong>采集不单独售卖</strong>，随免费的 <span class='mono'>account.manage</span> 提供。
<br><br>理由是杀死判据的有效性——若采集关在 pro 后面，
<span class='mono'>/admin/adoption</span> 测的就不再是<strong>习惯有没有形成</strong>，
而是<strong>愿不愿意付钱</strong>，而 ADR-012 正是用前者决定判断层建不建。
更基本的一条：采集是判断的前提，把前提关在门后等于把产品关在门后。</div>

<div class="note warn"><strong>只有一个键把「提议」和「执行」分开</strong>，那就是 <span class='mono'>copilot.autopilot</span>，
而它单独占据最高一档。ADR-003 的「智能体提议、人裁决」在 free 到 business 是<strong>结构性保证</strong>；
到 enterprise 才成为一条可以被买下的例外，而例外本身仍需人先采纳。</div>
</section>

<section id="perms"><h2><span class="num">04</span>权限与角色<span class="h2-meta">20 / 7</span></h2><div class="rule"></div>

<p>权限码按域分 <span class='key'>read</span> / <span class='key'>write</span> 两级，三处例外，每一处都是一次业务裁定：</p>

<div class="card"><div class="card-head"><span class="card-title">signal.triage</span><span class="card-sub">不是 signal.write</span></div>
<p style='margin:0'>分拣信号（评分、判重、忽略、升级为线索）不是编辑信号。信号是采集来的证据，<strong>处置它和改写它是两件事</strong>。</p></div>

<div class="card"><div class="card-head"><span class="card-title">pipeline.forecast</span><span class="card-sub">从 pipeline.write 里分出来</span></div>
<p style='margin:0'>「拥有这条商机」和「对这个数字向组织承诺」是两种责任。
分开之后 <span class='mono'>sales_ops</span> 可以提交预测<strong>而不能改商机</strong>，销售代表反过来。</p></div>

<div class="card"><div class="card-head"><span class="card-title">account.record</span><span class="card-sub">incr/0011 · ADR-018</span></div>
<p><strong>记录发生了什么，不等于编辑客户档案。</strong>整个证据面此前挂在
<span class='mono'>account.write</span> 上，而那只有三个角色持有——于是
<strong>交付经理坐在客户会议里却写不下这件事发生过</strong>，市场经理也不能记录战役带来的对话。</p>
<p style='margin:0'>这两个洞正开在 ADR-012 杀死判据要读的那份证据上，而 ADR-006 的全部前提是
「记录必须是完整的」。新权限授予五个见客户的角色；不给 <span class='mono'>sales_ops</span>
（运营不见客户），不给 <span class='mono'>viewer</span>（只读按定义就是只读）。</p></div>

<div class="card"><div class="card-head"><span class="card-title">strategy.approve</span><span class="card-sub">incr/0002 · ADR-005</span></div>
<p style='margin:0'>批准一份计划不是编辑它——那是计划变成<strong>其余链路被考核的那个数字</strong>的时刻。
与上一条同形，只是高一层。<span class='mono'>marketing_manager</span> 保留 <span class='mono'>strategy.write</span> 可起草修改，
<strong>但不能替销售组织签字</strong>。</p></div>

<div class="note info">这个列表<strong>按到达顺序排</strong>而不是按域分组。
<span class='mono'>strategy.approve</span> 是增量加的，所以它排在末尾而不是回到 D1 那一组里。
列表镜像种子，种子只追加——<strong>为整齐而重排会破坏顺序对账</strong>，而那正是意外洗牌的唯一守卫。</div>
</section>

<section id="grid"><h2><span class="num">05</span>授权网格<span class="h2-meta">68 条</span></h2><div class="rule"></div>

__GRID__

<div class="note ok"><strong>只有一个角色持有 <span class='mono'>copilot.autopilot</span></strong>，
也只有它持有 <span class='mono'>strategy.approve</span>。两条最强的授权集中在同一个人身上是有意的：
常授权执行和替组织签字，都是「事后没人可问」的动作。</div>

<div class="note warn"><span class='mono'>admin.manage</span> 由<strong>两个</strong>角色持有——
<span class='mono'>sales_leader</span> 与 <span class='mono'>sales_ops</span>。
这不是慷慨，是防死锁：所有者引导只在<strong>首次登录</strong>跑一次，
若某天无人持有 <span class='mono'>admin.manage</span>，这个工作区<strong>没有回头路</strong>。
成员管理界面因此带一条<strong>最后一名管理员不可移除</strong>守卫。</div>
</section>

<section id="edges"><h2><span class="num">06</span>边界情形<span class="h2-meta">已裁定</span></h2><div class="rule"></div>

<div class="tw"><table>
<thead><tr><th>情形</th><th>行为</th><th>为什么</th></tr></thead>
<tbody>
<tr><td>无角色的成员</td><td>全部业务页面隐藏，渲染「尚未分配角色」</td>
<td>他<strong>付再多钱也解决不了</strong>——需要的是管理员，不是付款页</td></tr>
<tr><td>未订阅的工作区</td><td>渲染订阅入口</td><td>与上一条<strong>必须分开</strong>，两者的补救方式相反</td></tr>
<tr><td>降级后的工作区</td><td>提案队列可读，但必然为空</td>
<td>pro 以下产生不出提案，唯一读得到内容的是降级后的工作区——<strong>那正是挽留面本身</strong></td></tr>
<tr><td>bundled 覆盖</td><td>数据取得到，产品表面不点亮</td>
<td>界面面用更严的公式，见 <span class='mono'>YC-101</span> 第 02 节</td></tr>
</tbody></table></div>

<div class="note danger"><strong>没有任何页面在本地重算商业结论。</strong>
按钮的可见性一律来自服务端动作会重跑的<strong>同一个</strong> <span class='mono'>can()</span> 门。
信号页曾经用 <span class='mono'>["pro","business","enterprise"].includes(tier)</span> 算过一次，上线前被抓掉——
那是产品在本地推导商业结论，<strong>套餐一改就漂移</strong>。</div>
</section>
"""


def render():
    return (BODY.replace("__LEVELS__", _levels())
                .replace("__MATRIX__", _matrix())
                .replace("__GRID__", _grid()))


FOOT = "Vxture Yucer 文档体系 · 能力登记册 YC-201 · 矩阵与网格转录自 capability.ts 与 authz/catalog.ts，2026-08-26"
