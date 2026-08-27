# -*- coding: utf-8 -*-
"""YC-401 界面与导航."""

ANCHORS = [
    ("ds", "元件只有一个来源"),
    ("shell", "外壳的两个模式"),
    ("domains", "五个功能域"),
    ("detail", "详情页框架"),
    ("i18n", "两种语言"),
    ("debt", "已登记的界面债"),
]

LEDE = ("元件全部取自 <span class='mono'>@vxture/design-system</span>；本产品设计的是"
        "<strong>用它们组装出什么</strong>。这份文档说明外壳的两个模式、五个功能域的切法，"
        "以及每一处偏离设计系统的地方为什么被登记成债而不是悄悄留下。")

DOMAINS = [
    ("战略武备域", "打什么仗，拿什么打", "市场战略 · 产品目录", "解决方案 · 价目折扣（同页分段）· 细分市场"),
    ("兵力部署域", "打谁，谁去打，背多少", "销售规划", "销售区域 · 战略客户 · 预测口径"),
    ("火力侦察域", "怎么把火力变成线索", "市场执行 · 商机侦探", "线索分配"),
    ("阵地经营域", "这一仗怎么拿下", "客户管理 · 商机管理", "赢丢复盘（同页分段）· 报价管理"),
    ("战果结算域", "赢了之后钱怎么到账", "项目落地", "回款计划（同页分段）· 合同续约"),
]


def _domains():
    rows = []
    for name, q, built, planned in DOMAINS:
        rows.append('<tr><td><strong>%s</strong><br><span style="color:var(--text-dim);font-size:12px">%s</span></td>'
                    '<td><span class="tag t-ok">已建</span> %s</td>'
                    '<td style="color:var(--text-dim)"><span class="tag t-dim">开发中</span> %s</td></tr>'
                    % (name, q, built, planned))
    return ('<div class="tw"><table><thead><tr><th style="width:34%%">域</th>'
            '<th>模块</th><th></th></tr></thead><tbody>%s</tbody></table></div>' % "".join(rows))


BODY = r"""
<section id="ds"><h2><span class="num">01</span>元件只有一个来源<span class="h2-meta">刚性区</span></h2><div class="rule"></div>

<p>产品界面<strong>一律取自 <span class='mono'>@vxture/design-system</span></strong>：不自建组件、不复制其源码、
不为了「改一点样式」而 fork 本地副本。缺件时<strong>先向 DS 提需求</strong>。</p>

<div class="card"><div class="card-head"><span class="card-title">唯一被许可的本地封装</span><span class="card-sub">薄封装</span></div>
<p style='margin:0'>把 DS 元件与本产品的<strong>域语义</strong>绑定的薄封装——例如把 DS 的表格封装成「商机管道表」，
注入阶段机的列定义。<strong>薄封装不得重写 DS 的视觉。</strong>
主题与设计令牌以 DS 为准；<span class='mono'>brand.ts</span> 只承载产品标识，不承载颜色、间距、字体。</p></div>

<div class="note danger"><strong>确实必须临时自建的，登记 TD 条目</strong>——写明缺失的 DS 元件、临时实现位置、回收条件。
<strong>静默偏离通不过自我修正验收。</strong>当前登记在册的界面债见第 06 节，一共六条。</div>

<div class="card"><div class="card-head"><span class="card-title">伞包与 design-ui 的钉版</span><span class="card-sub">2026-08-26 实测</span></div>
<div class="kv"><div class="kv-k hi">应用装</div><div class="kv-v">@vxture/design-system ^9.0.4</div></div>
<div class="kv"><div class="kv-k hi">同时声明</div><div class="kv-v">@vxture/design-ui 6.0.4 <strong>精确值，无脱字号</strong></div></div>
<div class="kv"><div class="kv-k hi">为什么要声明</div><div class="kv-v txt">组件直接 import <span class='mono'>DataTable</span> / <span class='mono'>Section</span>，pnpm 严格 node_modules 下未声明的依赖解析不到</div></div>
<div class="kv"><div class="kv-k hi">为什么要精确</div><div class="kv-v txt">写 <span class='key'>^6.0.0</span> 时伞包升到 9.0.4 钉了 6.0.4，而本仓那条判定「已满足」原地不动——
一棵树里<strong>两份 design-ui</strong>，两个 <span class='mono'>Button</span>、两套 Popover / Tooltip / Fullscreen 的 React context，<strong>不报错</strong></div></div>
</div>
</section>

<section id="shell"><h2><span class="num">02</span>外壳的两个模式<span class="h2-meta">一级页 / 详情页</span></h2><div class="rule"></div>

<p>外壳三栏：左翼战况板 280px、中栏自适应（左右 16px）、右翼智能体 400px，间距 32px，body padding 24px。
<strong>但它有两个模式，由路由决定。</strong></p>

<div class="grid g2">
<div class="card"><div class="card-head"><span class="card-title">一级页</span><span class="card-sub">导航 + 汇总 + 智能体概要</span></div>
<p style='margin:0'>左翼战况板在：它回答「整体怎么样」。功能域模块条在页面上方，
告诉你正站在哪个域里，以及旁边还有什么。</p></div>
<div class="card"><div class="card-head"><span class="card-title">详情页</span><span class="card-sub">对象的各维度 + 智能体具体操作</span></div>
<p style='margin:0'>左翼与模块条<strong>都撤掉</strong>。你是因为选了这个对象才在这里，
「整体怎么样」和「这一个怎么样」争同一份注意力，而后者按定义赢。腾出的宽度是<strong>结果，不是理由</strong>。</p></div>
</div>

<div class="note info"><strong>用具名路由而不是段数判断。</strong>
<span class='mono'>/admin/members</span> 与 <span class='mono'>/admin/adoption</span> 有两段但<strong>不是详情页</strong>——
它们是恰好住在同一前缀下的一级页。按段数写的规则会把战况板从它们身上剥掉，
而且<strong>没人会注意到，直到有人去找它</strong>。</div>

<div class="card"><div class="card-head"><span class="card-title">右翼是插槽，不是数据</span><span class="card-sub">@deck 平行路由</span></div>
<p style='margin:0'>智能体面板由 <span class='mono'>@deck</span> 平行路由供给，所以<strong>知道屏幕上是哪个对象的那一层</strong>负责给它配面板。
布局层做不到这件事——它没有 params、读不到 pathname——它能产出的只有全工作区口径的面板，
而在详情页上那不是杂音，<strong>是一个错误答案</strong>。</p></div>
</section>

<section id="domains"><h2><span class="num">03</span>五个功能域<span class="h2-meta">导航切分</span></h2><div class="rule"></div>

<p>这是对同一批路由的<strong>第二种分组</strong>，只服务导航。ADR-001 的九个能力分区按<strong>对象归属</strong>切，
那是数据治理的正确答案；对一个正在决定去哪儿的人，「这八个里哪个拥有这一行」不是他在问的问题。</p>

<div class="note danger"><strong>模块有三种形态，而第三种是被一次错误逼出来的（2026-08-26）。</strong>
面板最初只有「已建」和「开发中」两种，于是它<strong>说了假话</strong>——把
<strong>赢丢复盘</strong>和<strong>回款计划</strong>标成开发中，而两者都已上线：
前者渲染在 <span class='mono'>/pipeline</span>,后者在 <span class='mono'>/delivery</span>。
根因是把「没有独立路由」当成了「没建」。
<br><br>第三种形态 <span class='key'>section</span> 说的是：<strong>已建，住在别的页面里</strong>——
点它落到那一页并定位到那一段。修法不是改标签，而是
<span class='mono'>functional-domains.test.ts</span> 现在断言
<strong>一个已被渲染的组件不得被标成开发中</strong>。反证过：把赢丢复盘改回
planned，测试立刻变红。
<br><br><strong>一个把可用功能说成不存在的面板，比一个漏掉它的面板更糟。</strong></div>

<div class="note info"><strong>功能域不拥有数据、不出现在任何键名里、不参与任何一道门。</strong>
它与能力分区、功能键、权限三者的完整关系见 <span class='mono'>YC-201</span> 第 01 节。
这里只说这五个是怎么切的、为什么这么叫。</div>

__DOMAINS__

<div class="note info"><strong>域名用指挥语汇，模块名用精确语汇，这是有意的分工。</strong>
五个域名一辈子读五次就记住了，模块名天天点——<strong>那里精确比锋利重要</strong>。
每个域名都复用产品已有的词（战役、阵地、火力、战果），不新造。</div>

<div class="card"><div class="card-head"><span class="card-title">智能体没有独立入口</span><span class="card-sub">D8 刻意不在五域中</span></div>
<p style='margin:0'>它是能力分区、也有页面，但<strong>不是一个你去的地方</strong>：它读记录，把需要人决定的事
放进你正在看的东西旁边的面板、首页流和详情页里。给它一个菜单项等于说反话——
说它是「又一个要记得点开的功能」，而那正是这个产品要否定的框架。
全对话页面从<strong>助手面板本身</strong>进入，那是它的输出所在的地方。</p></div>

<div class="note warn"><strong>后台管理不在五域里</strong>，从齿轮图标进。它不是工作也不是数据，是设置——
常驻一个分组，等于每周花掉版面去服务一件没人在周一打开的事。</div>
</section>

<section id="detail"><h2><span class="num">04</span>详情页框架<span class="h2-meta">围绕对象，不是围绕导航</span></h2><div class="rule"></div>

<p>详情页不保留顶层导航面板，但仍可分左中右——<strong>围绕这个对象的内容分</strong>。
两个已建成的详情页各自示范一种定位：</p>

<div class="grid g2">
<div class="card"><div class="card-head"><span class="card-title">/account/[id]</span><span class="card-sub">战区指挥所</span></div>
<p style='margin:0'>不是客户档案卡。它回答「这个客户身上正在打的仗」：阵地清单、健康度与其贡献因子、
关系证据、承诺、接触时效、作战计划。<strong>每个阵地都能跳到它自己的详情页</strong>——业务链要走得通。</p></div>
<div class="card"><div class="card-head"><span class="card-title">/pipeline/[id]</span><span class="card-sub">阵地</span></div>
<p style='margin:0'>敌情（对方的决策结构、在交付的项目、竞争）与我情（谁在负责、做过什么、卡在哪），
然后是下一步作战计划——<strong>助手提议，人签字</strong>。</p></div>
</div>

<div class="card"><div class="card-head"><span class="card-title">就地展开，不开子路由</span><span class="card-sub">已裁定</span></div>
<p style='margin:0'>详情内的维度用展开而非子路由。页面长一点可以接受；
把一个对象的六个维度拆成六条 URL，读者要在它们之间来回，<strong>而它们本来就应该被一起看</strong>。</p></div>

<div class="note danger"><strong>健康度是派生值，不是判断依据。</strong>
规格明写它「用于排序和预警，不作为任何业务判断的唯一依据」。
所以面板<strong>不能只显示那个数字</strong>——它旁边一定渲染各因子的贡献，并点名最大的负因子。
「这个客户是 34 分」不可行动；「60 天没接触、一笔回款逾期、交付黄灯」可行动。</div>
</section>

<section id="i18n"><h2><span class="num">05</span>两种语言<span class="h2-meta">65 / 67</span></h2><div class="rule"></div>

<p>zh-CN 与 en-US。字典的形状由中文侧定义，英文侧<strong>展开中文再覆盖</strong>——
所以任何一个键都不会渲染成 <span class='mono'>undefined</span>，而没翻的部分<strong>可数而不是不可见</strong>。</p>

<div class="tw"><table>
<thead><tr><th>可机器校验</th><th></th></tr></thead>
<tbody>
<tr><td class="mono">grep -c "^export \(const\|function\) " messages.ts</td><td class="num">67 分母</td></tr>
<tr><td class="mono">grep -c "^  [A-Za-z_]*: [{([]" messages.en.ts</td><td class="num">65 分子</td></tr>
</tbody></table></div>

<p>差的两条是 <span class='mono'>PREVIEW_FIXTURES</span> / <span class='mono'>PREVIEW_TEXT</span>，
属于离线预览页——按构造钉在 zh-CN 的夹具页，<strong>是演示数据不是产品文案</strong>。</p>

<div class="note danger"><strong>接线是一半，翻译是另一半。</strong>
2026-08-26 之前有 16 个组件<strong>直接 import 中文模块</strong>，从不查字典——
所以在英文侧补翻译<strong>不产生任何效果</strong>，详情页无论如何都是中文。
同类缺陷还有一处：传给 DS 的那组文案曾是一个<strong>模块级常量</strong>模块，
而模块级常量在 import 时求值，等于把第一个加载的语言冻住发给之后所有读者。</div>

<div class="note ok"><strong>一个只有渲染成英文才会出现的缺陷。</strong>
健康度面板曾读作「1 instalments overdue」。中文没有复数，所以这个缺陷<strong>在第一句英文渲染出来之前不可能存在</strong>。
修法是一个英文侧独有的复数助手——<strong>这种不对称是对的，不是遗漏</strong>。</div>
</section>

<section id="debt"><h2><span class="num">06</span>已登记的界面债<span class="h2-meta">TD 登记册</span></h2><div class="rule"></div>

<p>每一条都写明：缺的 DS 元件、权宜位置、恢复条件。<strong>登记本身就是不静默偏离的证据。</strong></p>

<div class="tw"><table>
<thead><tr><th>TD</th><th>缺的元件</th><th>状态</th></tr></thead>
<tbody>
<tr><td class="mono">005</td><td>环境背景（铺满视口、不携带信息的装饰层）</td><td><span class="tag t-warn">未偿</span> 登录页</td></tr>
<tr><td class="mono">006</td><td>计数徽标（实底、圆形、随图标按钮尺寸走、带 99+ 溢出）</td><td><span class="tag t-warn">未偿</span> 助手角标</td></tr>
<tr><td class="mono">007</td><td>正文行宽 token —— 版面宽度不是行宽，差一个量级</td><td><span class="tag t-warn">未偿</span> 8 处 62ch</td></tr>
<tr><td class="mono">008</td><td>数据可视化族（占比条、条形列表、迷你趋势线、分类色阶）</td><td><span class="tag t-warn">未偿</span> 3 处本地实现</td></tr>
<tr><td class="mono">009</td><td>环形进度</td><td><span class="tag t-warn">未偿</span> 信号评分环</td></tr>
<tr><td class="mono">011</td><td>—</td><td><span class="tag t-ok">已关闭</span> 见下</td></tr>
</tbody></table></div>

<div class="note danger"><strong>TD-011 是一次把根因推给上游的误判，值得留在这里。</strong>
一条 React key 警告被追进 DS 的构建产物，看到 <span class='mono'>Section</span> 用的是
<span class='mono'>jsx</span> 而非 <span class='mono'>jsxs</span>，于是登记成「等 DS 改一个字符」。
<strong>结论是错的</strong>：把 <span class='mono'>Section</span> 换成裸 <span class='mono'>&lt;div&gt;</span>，
警告原样出现——DS 根本不在链路里。真正拼出无 key 数组的是本仓自己的中间层，
而警告点名的两个组件<strong>恰好都不是真凶</strong>。
<br><br><strong>留下的规矩：怀疑上游是根因时，先造一个不含上游的对照组。</strong></div>

<div class="note info"><strong>色彩不能当墨色用。</strong>
语义色以 <span class='key'>--x</span>（填充）/ <span class='key'>--x-text</span>（文字）/
<span class='key'>--x-muted-foreground</span> 三个槽发布。
把填充色当文字色用过一次，<span class='mono'>text-warning</span> 在浅底上是 <strong>1.72:1</strong>——
远低于可读下限。六处已统一收进视图映射层。</div>
</section>
"""


def render():
    return BODY.replace("__DOMAINS__", _domains())


FOOT = "Vxture Yucer 文档体系 · 界面与导航 YC-401 · design-system 9.0.4 / design-ui 6.0.4，事实截至 2026-08-26"
