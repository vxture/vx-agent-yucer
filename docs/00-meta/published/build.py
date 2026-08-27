# -*- coding: utf-8 -*-
"""Render the whole set. Rails come from system.URLS, so one pass after the
first publish links the set together."""
import io, json, os, sys
sys.path.insert(0, '.')
import system

if os.path.exists('urls.json'):
    system.URLS.update(json.load(io.open('urls.json', encoding='utf-8')))

import doc_status, doc_arch, doc_entitle, doc_data, doc_surface

DOCS = [
    ('status',  doc_status,  '产品现状',   doc_status.BODY),
    ('arch',    doc_arch,    '系统架构',   doc_arch.BODY),
    ('entitle', doc_entitle, '能力登记册', doc_entitle.render()),
    ('data',    doc_data,    '数据结构',   doc_data.render()),
    ('surface', doc_surface, '界面与导航', doc_surface.render()),
]

for slug, mod, title, body in DOCS:
    html = system.page(slug, title, mod.LEDE, mod.ANCHORS, body, mod.FOOT)
    io.open('%s.html' % slug, 'w', encoding='utf-8').write(html)
    linked = sum(1 for s, _, _, p in system.DOCS if p and s in system.URLS)
    print('  %-9s %6.1f KB   rail 已链接 %d/%d' % (slug, len(html.encode()) / 1024, linked, len(system.DOCS)))
