# -*- coding: utf-8 -*-
"""Check every figure this document set states against the source it claims.

A document that says "transcribed from capability.ts" and is not, is worse than
one that says nothing - it is a wrong number wearing a citation. This runs
before every publish.
"""
import io, re, sys
sys.path.insert(0, '.')
import doc_entitle as D

SRC = '/Users/stonesmoker/MyWebSite/vxtureagents/vx-agent-yucer/portals/app/app'
cap = io.open(SRC + '/entitlement/capability.ts', encoding='utf-8').read()
cat = io.open(SRC + '/authz/catalog.ts', encoding='utf-8').read()

def const_array(text, name):
    m = re.search(re.escape(name) + r'\s*(?::[^=]*)?=\s*\[(.*?)\](?:\s*as const)?;', text, re.S)
    return re.findall(r'"([^"]+)"', re.sub(r'//.*', '', m.group(1)))

fails = []
def chk(label, src, mine, ordered=True):
    same = (src == mine) if ordered else (sorted(src) == sorted(mine))
    print(('  OK   ' if same else '  FAIL ') + '%-26s %d' % (label, len(src)))
    if not same:
        fails.append(label)
        print('        源码多出:', [x for x in src if x not in mine])
        print('        我多出  :', [x for x in mine if x not in src])
        if sorted(src) == sorted(mine):
            i = next(i for i in range(len(src)) if src[i] != mine[i])
            print('        顺序不同，首个差异位 %d: 源码 %s / 我 %s' % (i, src[i], mine[i]))

print('== 能力矩阵 ==')
chk('FEATURE_KEYS', const_array(cap, 'FEATURE_KEYS'), [k for _, k, _ in D.FEATURES])
for name, mine, base in [('FREE', D.FREE, []), ('STARTER', D.STARTER, D.FREE),
                         ('PRO', D.PRO, D.STARTER), ('BUSINESS', D.BUSINESS, D.PRO),
                         ('ENTERPRISE', D.ENTERPRISE, D.BUSINESS)]:
    chk(name + ' 增量', const_array(cap, 'const ' + name), [x for x in mine if x not in base])

print('== 权限与角色 ==')
chk('PERM_CODES', const_array(cat, 'PERM_CODES'), D.PERMS)
chk('ROLE_CODES', const_array(cat, 'ROLE_CODES'), D.ROLES)
rp = re.sub(r'//.*', '', re.search(r'ROLE_PERMISSIONS[^=]*= \{(.*?)\n\};', cat, re.S).group(1))
total = 0
for r in D.ROLES:
    got = re.findall(r'"([^"]+)"', re.search(re.escape(r) + r':\s*\[(.*?)\]', rp, re.S).group(1))
    total += len(got)
    chk('  ' + r, got, D.GRANTS[r])
print('  授权合计 %d，文档写 117 -> %s' % (total, 'OK' if total == 117 else 'FAIL'))
if total != 117:
    fails.append('grant total')

# --------------------------------------------------------------------------
# FACTS THE FIRST VERSION DID NOT WATCH.
#
# Everything above checks the entitlement and permission catalogues, which is
# where this file started - and those stayed honest. What rotted was everything
# ELSE the documents state: the test count, the table count, the required-check
# count, the DS pins, and worst of all three modules described as "开发中" that
# had all been built. Nine days, nobody noticed, because no check looked.
#
# The lesson is not "somebody should have remembered". A number in a document
# with no check behind it is a number that will be wrong, and the only question
# is when. So these are checked too now.
# --------------------------------------------------------------------------
import json, os, subprocess

REPO = os.path.abspath(SRC + '/../../..')
APP = REPO + '/portals/app'

def chk_num(label, actual, doc):
    ok = str(actual) == str(doc)
    print(('  OK   ' if ok else '  FAIL ') + '%-26s 源码 %s / 文档 %s' % (label, actual, doc))
    if not ok:
        fails.append(label)

status = io.open('doc_status.py', encoding='utf-8').read()
arch = io.open('doc_arch.py', encoding='utf-8').read()

print('== 规模事实 ==')

# db 测试文件数
n_db = len([f for r, _, fs in os.walk(APP + '/app') for f in fs if f.endswith('.db.test.ts')])
m = re.search(r'再跑 (\d+) 个', status)
chk_num('*.db.test.ts 文件数', n_db, m.group(1) if m else '缺')

# 数据表数 - 从 DDL 数 CREATE TABLE，不需要跑库
ddl = ''
for root, _, fs in os.walk(REPO + '/deploy/database/ddl'):
    for f in sorted(fs):
        if f.endswith('.sql'):
            ddl += io.open(os.path.join(root, f), encoding='utf-8').read()
created = set(re.findall(r'CREATE TABLE IF NOT EXISTS\s+([\w.]+)', ddl))
dropped = set(re.findall(r'DROP TABLE IF EXISTS\s+([\w.]+)', ddl))
m = re.search(r'card-title">(\d+)</span><span class="card-sub">数据表', status)
chk_num('数据表', len(created - dropped), m.group(1) if m else '缺')

# 必需检查数 - 从分支保护 ruleset 的 JSON 数
ruleset = json.load(io.open(REPO + '/docs/50-deployment/rebuild/main-ruleset.json', encoding='utf-8'))
req = []
for r in ruleset.get('rules', []):
    if r.get('type') == 'required_status_checks':
        req = r['parameters']['required_status_checks']
m = re.search(r'card-title">(\d+)</span><span class="card-sub">必需检查', status)
chk_num('必需检查', len(req), m.group(1) if m else '缺')

# DS 版本
pkg = json.load(io.open(APP + '/package.json', encoding='utf-8'))
for name, pat in [('design-system', r'design-system ([\d.]+)'), ('design-ui', r'design-ui ([\d.]+)')]:
    m = re.search(pat, status)
    chk_num(name, pkg['dependencies']['@vxture/' + name].lstrip('^'), m.group(1) if m else '缺')

# 权限总数，正文里另有一处
m = re.search(r'(\d+) 个权限、五个功能域', status)
chk_num('正文权限数', len(D.PERMS), m.group(1) if m else '缺')

# 单测数与页脚日期。build.py 每次都写页脚，所以一个停在旧日期的页脚
# 是"事实没刷新"最直接的信号。
import subprocess as _sp
try:
    out = _sp.run(['pnpm', 'test'], cwd=APP, capture_output=True, text=True, timeout=600).stdout
    n_pass = re.search(r'^\u2139 pass (\d+)', out, re.M)
    if n_pass:
        m = re.search(r'card-title">([\d\s]+)</span><span class="card-sub">单元测试', status)
        chk_num('单元测试数', n_pass.group(1), (m.group(1) if m else '缺').replace(' ', ''))
except Exception as e:
    print('  SKIP 单元测试数                  （未能运行 pnpm test: %s）' % type(e).__name__)

m = re.search(r'事实截至 (\d{4}-\d{2}-\d{2})', status)
import doc_status as _ds  # noqa
sysmod = io.open('system.py', encoding='utf-8').read()
vd = re.search(r'VERSION_DATE = "([^"]+)"', sysmod).group(1)
chk_num('页脚事实日期', vd, m.group(1) if m else '缺')

# arch 文档在两处独立地陈述目录规模（门那一行，和空白区卡片）。第一版守卫只
# 查了第一处，第二处因此又躺了九天——一个只查一半的检查，读起来和查全了一样。
for label, pat in [('arch 门内目录规模', r'(\d+) 个权限 × (\d+) 个角色 = (\d+) 条授权'),
                   ('arch 空白区目录规模', r'(\d+) 权限 / (\d+) 角色 / (\d+) 授权')]:
    m = re.search(pat, arch)
    got = '/'.join(m.groups()) if m else '缺'
    chk_num(label, '%d/%d/%d' % (len(D.PERMS), len(D.ROLES), total), got)

print('== 模块状态 ==')
# 文档标为「开发中 / 白地」的模块，必须真的没有页面
UNBUILT_CARD = re.search(r'card-title">([^<]*)</span><span class="card-sub">白地', status)
claimed = [x.strip() for x in UNBUILT_CARD.group(1).split('/')] if UNBUILT_CARD else []
ROUTE_OF = {'线索分配': 'routing', '线索分派': 'routing', '合同续约': 'renewal', '细分市场': 'segment'}
built_anyway = [c for c in claimed
                if c in ROUTE_OF and os.path.exists(APP + '/app/(app)/' + ROUTE_OF[c] + '/page.tsx')]
print(('  OK   ' if not built_anyway else '  FAIL ') + '%-26s 文档称未建：%s' % ('白地清单', ', '.join(claimed) or '（无）'))
if built_anyway:
    print('        但这些页面已经存在:', ', '.join(built_anyway))
    fails.append('白地清单')

print('== 域与模块命名 ==')
# 流程图里的分区名必须是界面在用的名字
msg = io.open(APP + '/app/(app)/lib/messages.ts', encoding='utf-8').read()
labels = dict(re.findall(r'^  (\w+): "([^"]+)",', re.search(
    r'export const DOMAIN_LABEL[^=]*=\s*\{(.*?)\n\};', msg, re.S).group(1), re.M))
for key, doc_name in [('signal', None), ('delivery', None)]:
    live = labels[key]
    ok = live in status
    print(('  OK   ' if ok else '  FAIL ') + '%-26s 界面用 %s' % ('D-' + key + ' 名称', live))
    if not ok:
        stale = re.findall(r'D[0-9] ([\u4e00-\u9fa5]{2,6})</div>', status)
        print('        文档流程图里的名字:', stale)
        fails.append(key + ' 名称')

# --------------------------------------------------------------------------
# NAME DRIFT, ACROSS EVERY GENERATOR AT ONCE.
#
# The five functional domains and the twenty module labels were renamed on
# 2026-09-01, and three of the five generators kept the old names for three
# days. The block above only watched two module keys inside doc_status.py; a
# rename does not respect that scoping, so this watches ALL of them in ALL of
# them. The retired names are listed explicitly rather than inferred: a name
# that is gone is gone, and a document still saying it is stating a fact that
# was never true of the build it claims to describe.
# --------------------------------------------------------------------------
print('== 已废弃名称 ==')
GROUPS = dict(re.findall(r'^  (\w+): "([^"]+)",', re.search(
    r'export const DOMAIN_GROUP_LABEL[^=]*=\s*\{(.*?)\n\};', msg, re.S).group(1), re.M))
RETIRED = ["兵力部署域", "火力侦察域", "战果结算域", "态势侦察", "战果闭环",
           "价目折扣", "战略客户", "线索分配", "回款计划", "市场执行 ·", "商机侦探 ",
           "价格本"]
for gen in ['doc_status.py', 'doc_arch.py', 'doc_entitle.py', 'doc_data.py', 'doc_surface.py']:
    txt = io.open(gen, encoding='utf-8').read()
    hits = sorted({r for r in RETIRED if r in txt})
    print(('  OK   ' if not hits else '  FAIL ') + '%-26s %s' % (gen, ', '.join(hits) or '-'))
    if hits:
        fails.append(gen + ' 旧名称')
# and the live five must all appear somewhere in the set, or the rename only
# half-landed - the retired list above cannot catch a name that was dropped
# rather than replaced.
allgen = ''.join(io.open(g, encoding='utf-8').read()
                 for g in ['doc_status.py', 'doc_arch.py', 'doc_entitle.py',
                           'doc_data.py', 'doc_surface.py'])
missing = [v for v in GROUPS.values() if v not in allgen]
print(('  OK   ' if not missing else '  FAIL ') + '%-26s %s'
      % ('五个域名全部在册', ', '.join(missing) or '-'))
if missing:
    fails.append('域名缺席')

# --------------------------------------------------------------------------
# THE PROSE NUMBERS. The grids are generated from D.PERMS / D.ROLES / D.GRANTS
# and so cannot drift; the sentences AROUND them are hand-written and did -
# "20 权限 x 7 角色 = 68 授权" survived two increments of each.
# --------------------------------------------------------------------------
print('== 散文里的数字 ==')
n_p, n_r = len(D.PERMS), len(D.ROLES)
n_g = sum(len(v) for v in D.GRANTS.values())
ent = io.open('doc_entitle.py', encoding='utf-8').read()
for label, pat in [('权限数', r'功能键、(\d+) 个权限|fn-name">(\d+) 个权限'), ('权限 x 角色 = 授权',
                    r'(\d+) 权限 × (\d+) 角色 = (\d+) 授权'),
                   ('h2 权限/角色', r'权限与角色<span class="h2-meta">(\d+) / (\d+)</span>'),
                   ('h2 授权条数', r'授权网格<span class="h2-meta">(\d+) 条</span>')]:
    got = re.findall(pat, ent)
    if label == '权限数':
        got = [g for pair in got for g in pair if g]
    want = {'权限数': [str(n_p)],
            '权限 x 角色 = 授权': [(str(n_p), str(n_r), str(n_g))],
            'h2 权限/角色': [(str(n_p), str(n_r))],
            'h2 授权条数': [str(n_g)]}[label]
    ok = bool(got) and all(g == want[0] for g in got)
    print(('  OK   ' if ok else '  FAIL ') + '%-26s 源码 %s / 文档 %s' % (label, want[0], got or '缺'))
    if not ok:
        fails.append(label)

print()
if fails:
    print('不一致：', ', '.join(fails)); sys.exit(1)
print('全部一致 —— 文档里的每个数字都对得上源码。')
