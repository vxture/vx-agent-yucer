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
print('  授权合计 %d，文档写 86 -> %s' % (total, 'OK' if total == 86 else 'FAIL'))
if total != 86:
    fails.append('grant total')

print()
if fails:
    print('不一致：', ', '.join(fails)); sys.exit(1)
print('全部一致 —— 文档里的每个数字都对得上源码。')
