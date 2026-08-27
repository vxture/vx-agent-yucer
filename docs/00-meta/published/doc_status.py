# -*- coding: utf-8 -*-
"""YC-001 产品现状."""

ANCHORS = [
    ("what", "它是什么"),
    ("claim", "与传统 CRM 的分界"),
    ("built", "已建成"),
    ("money", "钱的链路已接通"),
    ("open", "未建成"),
    ("waiting", "等外部裁定"),
]

LEDE = ("yucer 是什么、已经建成了什么、还差什么。事实取自仓库与 "
        "<span class='mono'>docs/70-workplan</span>——写着「要做」的东西不算已建成，"
        "<strong>有后端但界面接不到的东西也不算</strong>，而后者现在由一条测试守着。")

BODY = r"""
<section id="what"><h2><span class="num">01</span>它是什么<span class="h2-meta">YC-001</span></h2><div class="rule"></div>

<p>yucer 是 <strong>Vxture 的企业销售超级智能体</strong>，主市场是中国企业销售组织
（<span class='mono'>brand.ts</span> 的 <span class='key'>defaultLocale: "zh-CN"</span>，全部产品规格以中文撰写）。
它<strong>不托管任何模型</strong>——推理向 Atlas 采购，能力编排向 Runos 采购（ADR-004）。</p>

<p><strong>「域」这个字在本产品里指两件事，数字不同，两个都是当前的。</strong>
先说清楚，否则下面每一张图都会读错。</p>

<div class="grid g2">
<div class="card"><div class="card-head"><span class="card-title">九个能力分区 · D1–D9</span>
<span class="card-sub">ADR-001 · 治理</span></div>
<div class="kv"><div class="kv-k hi">按什么切</div><div class="kv-v txt"><strong>对象归属</strong>——谁拥有这一行，谁能写它</div></div>
<div class="kv"><div class="kv-k hi">谁在用</div><div class="kv-v txt">权限命名空间、19 个功能键的前缀、schema 归属</div></div>
<div class="kv"><div class="kv-k hi">2026-08-26</div><div class="kv-v txt">八 → 九：目录（ADR-017）。它<strong>不带功能键</strong>，19 个键不变</div></div>
<div class="kv"><div class="kv-k hi">读者</div><div class="kv-v txt">写代码的人、做门控的人</div></div>
</div>
<div class="card"><div class="card-head"><span class="card-title">五个功能域</span>
<span class="card-sub">导航 · 2026-08-26 引入</span></div>
<div class="kv"><div class="kv-k hi">按什么切</div><div class="kv-v txt"><strong>销售动作的先后</strong>——打什么仗、打谁、怎么找、怎么赢、钱怎么到</div></div>
<div class="kv"><div class="kv-k hi">谁在用</div><div class="kv-v txt">九宫格启动器、页面上方的模块条。<strong>不拥有任何数据、不门控任何东西</strong></div></div>
<div class="kv"><div class="kv-k hi">读者</div><div class="kv-v txt">正在决定去哪儿的人</div></div>
</div>
</div>

<div class="note warn"><strong>为什么不合并成一套。</strong>
对象归属是数据治理的正确答案，但它不是一个人站在菜单前会问的问题——
「这八个里哪个拥有这一行」对导航毫无意义，而「交付」和「商机」在一个追欠款的销售眼里
本来就是一件事。硬合并只会让其中一套变得不诚实。
<br><br><strong>但两套都叫「域」是一次命名事故，本文档承认它。</strong>
五域的切法与命名见 <span class='mono'>YC-401</span> 第 03 节；
<strong>九个分区、19 个功能键、24 个权限、五个功能域四者的完整关系见
<span class='mono'>YC-201</span> 第 01 节</strong>——那一节是权威口径，本文档不复述。
下面各节说的都是<strong>能力分区</strong>。</div>

<p>能力分区按<strong>对象归属</strong>切：一个对象只有一个归属域，其他域只读引用它。</p>

<div class="flow">
  <div class="flow-node n-violet"><div class="fn-name">D1 市场销售战略</div><div class="fn-desc">打什么仗</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-violet"><div class="fn-name">D2 销售规划</div><div class="fn-desc">打谁，背多少</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-blue"><div class="fn-name">D3 市场执行</div><div class="fn-desc">战役与信号</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-blue"><div class="fn-name">D4 客户管理</div><div class="fn-desc">关系与决策链</div></div>
</div>
<div class="flow">
  <div class="flow-node n-green"><div class="fn-name">D5 商机侦探</div><div class="fn-desc">主动侦察</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-green"><div class="fn-name">D6 商机管理</div><div class="fn-desc">阶段机与预测</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-amber"><div class="fn-name">D7 项目落地</div><div class="fn-desc">钱到账</div></div>
  <div class="flow-arrow"><div class="flow-arrow-line"></div><div class="flow-arrow-head">▸</div></div>
  <div class="flow-node n-red"><div class="fn-name">D8 销售智能助手</div><div class="fn-desc">横切全部七域</div></div>
</div>

<div class="note info">D8 <strong>不是第八个功能</strong>，是产品本身。它读前七域的记录，把需要人决定的事放到你正在看的东西旁边。
界面上它没有独立入口——理由见 <span class='mono'>YC-401</span>。</div>
</section>

<section id="claim"><h2><span class="num">02</span>与传统 CRM 的分界<span class="h2-meta">ADR-003</span></h2><div class="rule"></div>

<p>这条分界不是措辞，是<strong>数据库强制</strong>的：</p>

<div class="card">
  <div class="card-head"><span class="card-title">智能体提议，人裁决</span><span class="card-sub">ADR-003</span></div>
  <div class="kv"><div class="kv-k hi">不可变列</div><div class="kv-v">agent_action.payload / rationale / confidence</div></div>
  <div class="kv"><div class="kv-k hi">采纳的前提</div><div class="kv-v">accepted 需要 decided_by_sub 非空</div></div>
  <div class="kv"><div class="kv-k hi">兜底机制</div><div class="kv-v txt"><span class="lock db">列锁</span> 98_column_locks.sql，服务角色无 UPDATE 授权，违反在运行时失败而非评审时</div></div>
</div>

<p>记录系统是「你录入，它汇总」。这个产品要在记录之上<strong>产出新信息</strong>——所以第一件事是先真的有记录，
这就是证据面（ADR-006）与<strong>一期带杀死判据</strong>（ADR-012）存在的原因：
六周窗口，按 <span class='mono'>/admin/adoption</span> 的覆盖率读数决定二期建不建。</p>

<div class="note warn"><strong>判据的两个决定值得记住。</strong>
测<strong>覆盖率</strong>不测数量——一个人往一条商机倒二十条笔记，「每周交互数」会很好看，而另外十九条商机全黑。
<strong>刻意不按人拆分并写在界面上</strong>——一旦能当绩效看，大家就会为它记录，它就不再测量它要测的东西。</div>
</section>

<section id="built"><h2><span class="num">03</span>已建成<span class="h2-meta">批次 1–6</span></h2><div class="rule"></div>

<p>下表是<strong>闭的环</strong>，不是任务清单。</p>

<div class="tw"><table>
<thead><tr><th>批次</th><th>闭的环</th><th>关键产出</th></tr></thead>
<tbody>
<tr><td>1</td><td>产品域结构</td><td>八个能力分区定义、五 schema、能力矩阵、角色权限目录、列锁</td></tr>
<tr><td>2</td><td>域规则与持久化</td><td>八个能力分区 <span class='mono'>service.ts</span> 两道门 → 纯函数 → 端口；内存与 Prisma 双实现</td></tr>
<tr><td>3</td><td>产品界面</td><td>八个能力分区路由、管道与预测视图、会话与提案裁决、信号收件箱、流式回答、剧本目录</td></tr>
<tr><td>3.5</td><td>证据面</td><td><span class='mono'>yucer_field</span> 三表；承诺不能靠断言关闭；采集表单只有一个必填字段</td></tr>
<tr><td>4</td><td>真数据库通道</td><td><span class='mono'>db-contract</span> job：postgres:18 跑真 DDL 再跑 15 个 <span class='mono'>*.db.test.ts</span></td></tr>
<tr><td>5</td><td>外壳与国际化</td><td>三栏外壳、功能域启动器、zh-CN / en-US 双字典（65/67 常量）</td></tr>
<tr><td>6</td><td>设计系统对齐</td><td>design-system 9.0.4 / design-ui 6.0.4，后者按伞包精确钉版</td></tr>
<tr><td><strong>6</strong></td><td><strong>把已建成的后端接上界面</strong></td>
<td>钱的链路四个动词全部接通；D9 目录从裁定走到可用（服务 + 适配器 + 页面）；商机行项可编辑且 header 随之重算；战略客户可定级；接线守卫上线</td></tr>
</tbody></table></div>

<div class="grid g3">
  <div class="card"><div class="card-head"><span class="card-title">1 030</span><span class="card-sub">单元测试</span></div><p style='margin:0'>0 失败。含 15 项对真 Postgres 的契约测试。</p></div>
  <div class="card"><div class="card-head"><span class="card-title">44</span><span class="card-sub">数据表</span></div><p style='margin:0'>跨 10 个 schema，列级写锁兜底。见 <span class='mono'>YC-301</span>。</p></div>
  <div class="card"><div class="card-head"><span class="card-title">5</span><span class="card-sub">必需检查</span></div><p style='margin:0'>quality-gate / build / test-coverage / audit / gitleaks，全绿。</p></div>
</div>

<div class="note ok"><strong>真数据库通道在它第一次运行里就抓到三个缺陷。</strong>
两个唯一索引建在可空列上，而 Postgres 的 UNIQUE 把 NULL 视为互不相同——所以它们<strong>对工作区级行完全失效</strong>，
而那正是其他所有数字的基准。内存适配器建模不了这件事，788 个绿灯下它活了很久。</div>
</section>

<section id="money"><h2><span class="num">04</span>钱的链路已接通<span class="h2-meta">批次 6，2026-08-26</span></h2><div class="rule"></div>

<p>这一节此前的标题是「钱的链路是断的」。<strong>本次发布把它改掉了。</strong></p>

<p>四个服务函数当时后端完整、测试全绿、权限已定义、表已建，而<strong>零界面写入路径</strong>——
串起来正好是 <span class='mono'>定目标 → 报预测 → 交付 → 回款</span>。演示数据把这条链填满了，
所以界面看起来是活的，真实工作区第一天就是空的。</p>

<div class="tw"><table>
<thead><tr><th>函数</th><th>接在哪</th><th>实测</th></tr></thead>
<tbody>
<tr><td class="mono">submitForecast</td><td>/pipeline 轨迹区的「存一次快照」</td>
<td>轨迹末点从种子的 08-01 变成当天；连点两次得<strong>两行</strong>，与 UPDATE 已 REVOKE 一致</td></tr>
<tr><td class="mono">createTarget<br>updateTarget</td><td>/planning 建立表单 + 行内菜单</td>
<td>建了一条草稿；草稿行三项齐全，已承诺行只剩两项</td></tr>
<tr><td class="mono">reconcileProjectHealth</td><td>/delivery 项目行内菜单</td>
<td>PRJ-0001 的「已下调」消失——推导值写进存储；再跑一次提示「填报与推导一致」</td></tr>
<tr><td class="mono">transitionInstalment</td><td>/delivery <strong>回款计划面板</strong></td>
<td>逾期分期标记为已回款、实收 320,000（计划 380,000）；逾期角标归零</td></tr>
<tr><td class="mono">replaceOpportunityLines</td><td>/pipeline/[id] <strong>产品行项编辑器</strong></td>
<td>一行数量 16 → 8，详情页与列表页的 header 双双从 ¥2,400,000 变成 ¥1,900,000；把单价压到 1，服务端标出「低于底价」</td></tr>
</tbody></table></div>

<div class="note ok"><strong>控件放在哪里，本身是论证。</strong>
快照按钮落在<strong>轨迹区</strong>而不是上方总额板：总额板是「现在是多少」，每次加载重算；
快照是<strong>冻结下来供日后争论的一次读数</strong>。按钮放在总额旁边会暗示它保存那个数字。
<br><br>同理，建立目标是<strong>表单</strong>（周期、作用域、指标、金额在有人敲进去之前都不存在），
调整目标是<strong>行内动作</strong>（数字就在屏幕上）。表单放在表格上方——
新工作区里表格必然是空的，把建立入口塞在一张没人能填满的列表下面，等于把门放在锁着的门后。</div>

<div class="note warn"><strong>DS 逼出的一个有用的问题。</strong>
<span class='mono'>ActionMenuItem</span> 只允许 <span class='mono'>confirm</span> 出现在
<span class='key'>danger: true</span> 的项上——要确认框，就得承认这个动作是危险的。
于是「提交为承诺」做成 Plain + hint（单向不可逆，但它是<strong>正常步骤</strong>,
把主路径染红会花掉「关闭本期」真正需要的那点颜色），
「关闭本期」做成 danger + 确认框（它冻结一个已结束周期上承诺过什么）。</div>

<div class="note danger"><strong>这一批真正的产物是一条守卫，不是四个按钮。</strong>
<span class='mono'>domains/shared/wired.test.ts</span>：每个域动词必须有域外的非测试调用方。
「后端完整、界面没接」在本仓复发过<strong>五次</strong>,而第四次被演示数据掩盖——
一个不会自己报错、只是让数字算不出来的缺陷，不会被看出来。
未接线仍然允许，但<strong>必须具名</strong>,写明原因与偿还它的批次项。
清单现在只剩一条：<span class='mono'>signal.previewAttribution</span>（无设计好的界面，ADR-016）。</div>
</section>

<section id="open"><h2><span class="num">05</span>未建成<span class="h2-meta">诚实清单</span></h2><div class="rule"></div>

<p>批次 6 之后这份清单短了很多。剩下的每一条都写明了它卡在什么上。</p>

<div class="grid g2">
<div class="card"><div class="card-head"><span class="card-title">线索分配 / 合同续约 / 细分市场</span><span class="card-sub">白地</span></div>
<p style='margin:0'>功能域面板里标着「开发中」的三项，无表、无规则、无界面。
标出来是因为<strong>一张完整的地图比一张只画已建成部分的地图有用</strong>——
灰着的「合同续约」回答了「这个产品做不做续约」,答案是「会做，还没做」。</p></div>

<div class="card"><div class="card-head"><span class="card-title">首次上线</span><span class="card-sub">运维，卡在平台侧</span></div>
<p style='margin:0'>平台侧 OIDC 客户端注册、域名、部署 Environment 与密钥、
<span class='mono'>db-init</span> 应用三段式 DDL。部署流水线<strong>已编写但未演练</strong>。</p></div>

<div class="card"><div class="card-head"><span class="card-title">问参谋</span><span class="card-sub">有意不接</span></div>
<p style='margin:0'>助手面板的提问按钮是 <span class='mono'>disabled</span> 的，标注「该能力尚未接通」。
<strong>一个静默什么都不做的按钮会教人相信产品坏了；一个明显没准备好的按钮不会。</strong></p></div>
</div>

<div class="note warn"><strong>本产品自己的方法论增量。</strong>
「后端完整、界面没接」在本仓复发过五次，第四次是被演示数据掩盖的。
因此它现在是一条<strong>测试</strong>而不是一条纪律——见第 04 节。

<br><br>批次 6 还留下两条关于守卫本身的教训：
<strong>一个会被注释骗过的守卫不是守卫</strong>（第一版接线守卫把
「neither is wired」这句注释当成了接线证据）；
<strong>两面互为镜子的东西彼此吻合，说不出它们中任何一个是不是真的</strong>
（列锁的双向对账让一条授权了不存在列的 GRANT 一路绿灯，而它会在部署时炸掉 db-init）。</div>
</section>

<section id="waiting"><h2><span class="num">06</span>等外部裁定<span class="h2-meta">三项</span></h2><div class="rule"></div>

<div class="tw"><table>
<thead><tr><th>事项</th><th>卡在哪里</th><th>本仓立场</th></tr></thead>
<tbody>
<tr><td><strong>TD-002</strong> 界面文案违反 source ASCII-only</td><td>等平台仓修订标准</td>
<td><span class="lock rule">只登记不裁定</span> CLAUDE.md 规定标准缺口先在平台仓修，不得在产品仓自造</td></tr>
<tr><td><strong>karda 接入</strong></td><td>等平台发布 karda 契约</td>
<td>ADR-007 已把消费侧立场定死（不自建第二个知识存储），<strong>契约发布前零代码</strong></td></tr>
<tr><td><strong>arda 能跑</strong></td><td>等 base URL / audience / scope / 游标语义</td>
<td>ADR-011。一期<strong>可合并、可单测、跑不起来</strong>，与 Atlas / Runos 今天状态相同</td></tr>
</tbody></table></div>

<div class="note danger"><strong>一版被丢弃的 karda 接入（2026-08-15）。</strong>
本仓曾写过三个文件含一个「主张可外发、证据不可外发」的边界模块，<strong>已整体丢弃</strong>——不是风格问题。
一次独立对抗审查在那个 137 行的边界文件里查出<strong>四条各自独立的客户名称越界路径</strong>，
最强的一道检查通过端口结构上不可达。<strong>可以把线格式的猜测隔离在适配器里；不可以把不属于自己的词汇表隔离起来。</strong></div>
</section>
"""

FOOT = "Vxture Yucer 文档体系 · 产品现状 YC-001 · 事实截至 2026-08-26 批次 6 合并后（1 030 项单测全绿）"
