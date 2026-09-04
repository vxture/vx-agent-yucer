# -*- coding: utf-8 -*-
"""
The yucer documentation system - shell, rail, catalogue.

ONE GENERATOR, NOT FIVE HAND-KEPT FILES. The thing being asked for is a
documentation SYSTEM, and consistency across a set is a property of how the set
is produced, not a discipline anyone can sustain by copying a header. The rail,
the palette, the type scale and every component live here once; a document
contributes a body and its catalogue entry and nothing else. A document that
wanted a different heading colour would have to edit this file, which is the
point.

The visual system is INHERITED VERBATIM from the karda / Atlas / Runos docs.
karda states the rule in its own stylesheet: a documentation system that
changes colour per product is three products, not one system. yucer identifies
itself by the rail brand and by what its documents say, never by its palette.
"""

# --------------------------------------------------------------------------
# The catalogue.
#
# YC-nnn, one stable id per document, banded by subject so an id says roughly
# what it is before you open it:
#
#   YC-0xx  product definition and boundary
#   YC-1xx  architecture and layering
#   YC-2xx  commerce and gating
#   YC-3xx  data and its constraints
#   YC-4xx  interface and navigation
#
# Ids are append-only and never reused - the same discipline the repo's ADR and
# TD registers use, for the same reason: a reference in a liaison letter or a
# commit message has to keep meaning what it meant.
# --------------------------------------------------------------------------

DOCS = [
    # slug,        id,       title,        published
    ("status",     "YC-001", "产品现状",     True),
    ("arch",       "YC-101", "系统架构",     True),
    ("entitle",    "YC-201", "能力登记册",   True),
    ("data",       "YC-301", "数据结构",     True),
    ("surface",    "YC-401", "界面与导航",   True),
    ("api",        "YC-102", "接口文档",     False),
    ("audit",      "YC-002", "审计报告",     False),
]

# --------------------------------------------------------------------------
# The version of the SET, not of a document.
#
# Documents in a set that version independently stop being a set: a reader
# holding YC-201 has no way to know whether the YC-301 beside it was written
# against the same product. One number, stamped on every page and moved on
# every release, answers that in the footer.
#
# MAJOR moves when a document is added or removed, or when a decision the set
# describes is reversed. MINOR moves when facts are refreshed against the repo.
# The date is the day the facts were read, not the day the file was edited -
# a document is only as current as its last verify.py run.
# --------------------------------------------------------------------------
VERSION = "v1.2"
VERSION_DATE = "2026-09-04"

# Filled in after the first publish pass; slug -> artifact URL.
URLS = {}

CSS = r"""
@import url('https://fonts.googleapis.com/css2?family=Funnel+Display:wght@600;700&family=Inter:wght@400;500;600&family=Geist+Mono:wght@400;700&display=swap');

/* @vxture/design-tokens - typography T1/T2 subset.
   Copied from vxture-design, identical to the Atlas / Runos / karda docs. An
   artifact's CSP admits Google Fonts and nothing else, so the package cannot be
   installed and the tokens it needs are inlined. They must stay identical to
   the DS; when the DS moves, this block moves with it. */
:root {
  --vx-font-sans: Inter, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', ui-sans-serif, system-ui, sans-serif;
  --vx-font-brand: 'Funnel Display', Inter, 'Noto Sans SC', sans-serif;
  --vx-font-mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Noto Sans Mono CJK SC', monospace;
  --vx-text-sm: 0.875rem;  --vx-text-base: 1rem;   --vx-text-lg: 1.125rem;
  --vx-text-2xl: 1.5rem;   --vx-text-4xl: 2.25rem;
  /* The whole document is Chinese, so the DS :lang(zh) leading compensation
     applies. The host <html> is not ours to attribute, so the value lands here. */
  --vx-cjk-leading-add: 0.15;

  /* Family palette - identical to the Atlas, Runos and karda docs ON PURPOSE.
     A documentation system that changes colour per product is N products, not
     one system; yucer identifies itself by the rail brand instead. */
  --bg: #f4f6f8; --surface: #ffffff; --surface2: #f6f8fa; --rail: #ffffff;
  --border: #d5dbe2; --border-soft: #e6eaef;
  --accent: #0969da; --accent2: #cf222e; --accent3: #1a7f37;
  --accent4: #9a6700; --accent5: #8250df;
  --text: #1f2328; --text-mid: #424950; --text-dim: #656d76;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0a0c10; --surface: #12161c; --surface2: #171c23; --rail: #0e1218;
    --border: #232a33; --border-soft: #1b2128;
    --accent: #6e9fff; --accent2: #ff6b7d; --accent3: #4ede9a;
    --accent4: #f0b429; --accent5: #b98cff;
    --text: #e6edf3; --text-mid: #a9b4c0; --text-dim: #8b98a5;
  }
}
:root[data-theme="dark"] {
  --bg: #0a0c10; --surface: #12161c; --surface2: #171c23; --rail: #0e1218;
  --border: #232a33; --border-soft: #1b2128;
  --accent: #6e9fff; --accent2: #ff6b7d; --accent3: #4ede9a;
  --accent4: #f0b429; --accent5: #b98cff;
  --text: #e6edf3; --text-mid: #a9b4c0; --text-dim: #8b98a5;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  background: var(--bg); color: var(--text);
  font-family: var(--vx-font-sans);
  font-size: var(--vx-text-base);
  line-height: calc(1.5 + var(--vx-cjk-leading-add));
  min-height: 100vh;
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

/* shell */
.shell { display: grid; grid-template-columns: 252px minmax(0, 1fr); min-height: 100vh; }
.rail {
  background: var(--rail); border-right: 1px solid var(--border);
  padding: 26px 18px 40px; position: sticky; top: 0; height: 100vh; overflow-y: auto;
}
.rail-brand {
  font-family: var(--vx-font-brand); font-size: 13px; letter-spacing: 3px;
  text-transform: uppercase; color: var(--accent); font-weight: 700;
}
.rail-title { font-size: var(--vx-text-lg); font-weight: 700; margin: 6px 0 20px; line-height: 1.35; }
.rail-group {
  font-size: var(--vx-text-sm); letter-spacing: 1.6px; text-transform: uppercase;
  color: var(--text-dim); margin: 22px 0 8px; font-weight: 600;
}
.rail a, .rail .doc-flat {
  display: block; font-size: var(--vx-text-sm); color: var(--text-mid);
  text-decoration: none; padding: 6px 10px; border-radius: 6px;
  border-left: 2px solid transparent;
}
.rail a:hover { background: var(--surface2); color: var(--text); }
.rail a.cur { color: var(--accent); border-left-color: var(--accent); background: var(--surface2); font-weight: 600; }
/* A document in the set that is not published yet. Rendered, but not a link -
   a dead link teaches the reader to distrust the rail. */
.rail .doc-flat { color: var(--text-dim); opacity: 0.62; cursor: default; }
.rail .doc-flat::after { content: " · 未发布"; font-size: 11px; }
.rail .yc { font-family: var(--vx-font-mono); font-size: 11px; color: var(--text-dim); float: right; }
/* The set's version, stamped once per page. Sits at the foot of the rail rather
   than beside the title: it belongs to the whole set, not to this document. */
.rail-ver {
  margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--border-soft);
  font-family: var(--vx-font-mono); font-size: 11px; color: var(--text-dim);
}
.main { padding: 34px 40px 100px; min-width: 0; }
@media (max-width: 1000px) {
  .shell { grid-template-columns: 1fr; }
  .rail { position: static; height: auto; border-right: none; border-bottom: 1px solid var(--border); }
  .main { padding: 24px 20px 60px; }
}

/* header */
.page-head { border-bottom: 2px solid var(--accent); padding-bottom: 20px; margin-bottom: 30px; }
.eyebrow {
  font-family: var(--vx-font-brand); font-size: 13px; letter-spacing: 3px;
  text-transform: uppercase; color: var(--accent); font-weight: 700; margin-bottom: 8px;
}
.page-head h1 {
  font-family: var(--vx-font-brand); font-size: var(--vx-text-4xl);
  font-weight: 600; letter-spacing: -0.4px; text-wrap: balance;
  line-height: calc(1.25 + var(--vx-cjk-leading-add));
}
.lede { color: var(--text-mid); font-size: var(--vx-text-lg); margin-top: 10px; max-width: 62em; }

/* sections */
section { margin-bottom: 46px; scroll-margin-top: 20px; }
h2 {
  font-family: var(--vx-font-brand); font-size: var(--vx-text-2xl); font-weight: 600;
  margin-bottom: 6px; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  line-height: calc(1.3 + var(--vx-cjk-leading-add)); text-wrap: balance;
}
h2 .num { font-size: 15px; color: var(--accent); font-family: var(--vx-font-mono); font-weight: 700; }
h2 .h2-meta {
  margin-left: auto; font-size: var(--vx-text-sm); font-weight: 500; color: var(--text-dim);
  background: var(--surface2); border: 1px solid var(--border-soft);
  padding: 2px 10px; border-radius: 5px;
}
h3 { font-size: var(--vx-text-lg); font-weight: 600; margin: 22px 0 8px; }
.rule { height: 1px; background: var(--border-soft); margin: 8px 0 20px; }
p { max-width: 62em; margin-bottom: 12px; color: var(--text-mid); }
p strong, li strong, td strong { color: var(--text); font-weight: 600; }
ul, ol { margin: 0 0 12px 20px; color: var(--text-mid); max-width: 62em; }
li { margin-bottom: 6px; }

/* card */
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 18px 20px; margin-bottom: 16px;
}
.card-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.card-title { font-size: var(--vx-text-base); font-weight: 600; color: var(--text); }
.card-sub { font-size: var(--vx-text-sm); color: var(--text-dim); }
.grid { display: grid; gap: 16px; }
.grid.g2 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.grid.g3 { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }

/* key/value rows - the workhorse */
.kv { display: grid; grid-template-columns: minmax(140px, 210px) minmax(0, 1fr); gap: 10px 18px; padding: 7px 0; border-top: 1px solid var(--border-soft); }
.kv:first-of-type { border-top: none; }
.kv-k { font-size: var(--vx-text-sm); color: var(--text-dim); }
.kv-k.hi { color: var(--text); font-weight: 500; }
.kv-v { font-family: var(--vx-font-mono); font-size: var(--vx-text-sm); color: var(--text); word-break: break-word; }
.kv-v.txt { font-family: var(--vx-font-sans); color: var(--text-mid); }
.mono, .key { font-family: var(--vx-font-mono); font-size: 0.92em; }
.key { background: var(--surface2); border: 1px solid var(--border-soft); border-radius: 4px; padding: 1px 6px; }

/* notes */
.note {
  border-left: 3px solid var(--border); background: var(--surface2);
  padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 14px 0;
  font-size: var(--vx-text-sm); color: var(--text-mid); max-width: 62em;
}
.note strong { color: var(--text); }
.note.info { border-left-color: var(--accent); }
.note.danger { border-left-color: var(--accent2); }
.note.ok { border-left-color: var(--accent3); }
.note.warn { border-left-color: var(--accent4); }

/* tags */
.tag {
  display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 8px;
  border-radius: 999px; border: 1px solid; white-space: nowrap;
}
.t-ok { color: var(--accent3); border-color: var(--accent3); }
.t-info { color: var(--accent); border-color: var(--accent); }
.t-warn { color: var(--accent4); border-color: var(--accent4); }
.t-bad { color: var(--accent2); border-color: var(--accent2); }
.t-dim { color: var(--text-dim); border-color: var(--border); }

/* flow diagram - inherited from the Runos doc */
.flow { display: flex; flex-wrap: wrap; align-items: stretch; gap: 0; margin: 18px 0; }
.flow-node {
  flex: 1 1 150px; min-width: 140px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 9px; padding: 12px 14px; border-top-width: 3px;
}
.flow-node .fn-name { font-weight: 600; font-size: var(--vx-text-sm); color: var(--text); }
.flow-node .fn-desc { font-size: 13px; color: var(--text-dim); margin-top: 4px; line-height: 1.55; }
.n-blue { border-top-color: var(--accent); }
.n-green { border-top-color: var(--accent3); }
.n-amber { border-top-color: var(--accent4); }
.n-red { border-top-color: var(--accent2); }
.n-violet { border-top-color: var(--accent5); }
.flow-arrow { flex: 0 0 34px; display: flex; align-items: center; justify-content: center; position: relative; }
.flow-arrow-line { height: 1px; width: 100%; background: var(--border); }
.flow-arrow-head { position: absolute; right: 6px; color: var(--text-dim); font-size: 13px; }
.flow-arrow-label { position: absolute; top: -16px; font-size: 11px; color: var(--text-dim); white-space: nowrap; }
@media (max-width: 760px) {
  .flow { flex-direction: column; }
  .flow-arrow { flex: 0 0 22px; transform: rotate(90deg); }
}

/* table */
.tw { overflow-x: auto; margin: 14px 0; }
table { border-collapse: collapse; width: 100%; font-size: var(--vx-text-sm); }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
th { color: var(--text-dim); font-weight: 600; white-space: nowrap; border-bottom-color: var(--border); }
td.mono, td .mono { font-family: var(--vx-font-mono); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--vx-font-mono); }

/* ---------------------------------------------------------------------- */
/* yucer's own additions. Three, and each earns its place by expressing a  */
/* rule this product repeats everywhere and the family kit cannot say.     */
/* ---------------------------------------------------------------------- */

/* THE TWO GATES. Entitlement then permission, in that order, both must pass -
   and the two failures are handled asymmetrically (an entitlement gap is
   advertised, a permission gap is silent). No family component states an
   ordered AND with different behaviour on each branch, and this product states
   it on every page, every route and every service function. */
.gate { display: flex; flex-wrap: wrap; align-items: stretch; gap: 10px; margin: 16px 0; }
.gate-step {
  flex: 1 1 220px; background: var(--surface); border: 1px solid var(--border);
  border-left-width: 3px; border-radius: 0 9px 9px 0; padding: 12px 15px;
}
.gate-step.g1 { border-left-color: var(--accent4); }
.gate-step.g2 { border-left-color: var(--accent5); }
.gate-step.g3 { border-left-color: var(--accent3); }
.gate-step .gs-n { font-family: var(--vx-font-mono); font-size: 11px; color: var(--text-dim); letter-spacing: 1px; }
.gate-step .gs-t { font-weight: 600; font-size: var(--vx-text-sm); color: var(--text); margin: 2px 0 4px; }
.gate-step .gs-d { font-size: 13px; color: var(--text-dim); line-height: 1.55; }
.gate-and { flex: 0 0 22px; display: flex; align-items: center; justify-content: center;
  font-family: var(--vx-font-mono); font-size: 13px; color: var(--text-dim); }

/* THE CAPABILITY MATRIX. A tier x feature grid where the only content is
   presence, so it reads as a shape rather than as 95 words. Cumulative tiers
   mean the filled region must look like a staircase; if it ever does not, the
   matrix is wrong. */
.mx { overflow-x: auto; margin: 14px 0; }
.mx table { font-size: 13px; }
.mx th.tier { text-align: center; font-family: var(--vx-font-mono); font-size: 11px;
  letter-spacing: 0.5px; text-transform: uppercase; }
.mx td.cell { text-align: center; font-family: var(--vx-font-mono); }
.mx td.on { color: var(--accent3); }
.mx td.off { color: var(--border); }
.mx td.feat { font-family: var(--vx-font-mono); font-size: 12px; white-space: nowrap; }

/* DATABASE-ENFORCED CONSTRAINTS. yucer's hard rules are not conventions - they
   are grants and column locks, so violating one fails at runtime rather than at
   review. The marker says which mechanism holds a given rule up, because "we
   agreed not to" and "the database refuses" are different guarantees. */
.lock { display: inline-block; font-family: var(--vx-font-mono); font-size: 11px;
  padding: 1px 7px; border-radius: 4px; white-space: nowrap;
  background: var(--surface2); border: 1px solid var(--border-soft); color: var(--text-mid); }
.lock.db { color: var(--accent2); border-color: var(--accent2); }
.lock.rule { color: var(--accent5); border-color: var(--accent5); }
.lock.test { color: var(--accent3); border-color: var(--accent3); }

.foot { margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--border-soft); font-size: 13px; color: var(--text-dim); }
.theme-btn {
  position: fixed; right: 18px; bottom: 18px; z-index: 9; cursor: pointer;
  background: var(--surface); color: var(--text-mid); border: 1px solid var(--border);
  border-radius: 999px; padding: 7px 14px; font-size: 13px; font-family: var(--vx-font-sans);
}
.theme-btn:hover { color: var(--text); }
"""

THEME_JS = r"""
(function () {
  var b = document.getElementById('themeBtn');
  if (!b) return;
  // Three states, matching the artifact host: no stamp = follow the system.
  // The button cycles rather than toggling, so a reader on a dark OS can still
  // pin light without fighting the media query.
  var order = ['system', 'light', 'dark'];
  var label = { system: '主题 · 跟随系统', light: '主题 · 亮', dark: '主题 · 暗' };
  var i = 0;
  try { var s = localStorage.getItem('yucer-doc-theme'); if (s && order.indexOf(s) >= 0) i = order.indexOf(s); } catch (e) {}
  function apply() {
    var m = order[i];
    if (m === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', m);
    b.textContent = label[m];
    try { localStorage.setItem('yucer-doc-theme', m); } catch (e) {}
  }
  b.addEventListener('click', function () { i = (i + 1) % order.length; apply(); });
  apply();
})();
"""


def rail(cur_slug, anchors):
    """The rail: brand, this document's title, the whole set, then this page."""
    out = ['<nav class="rail">',
           '<div class="rail-brand">Vxture Yucer</div>']
    title = next(t for s, i, t, p in DOCS if s == cur_slug)
    out.append('<div class="rail-title">%s</div>' % title)
    out.append('<div class="rail-group">文档集</div>')
    for slug, yid, t, published in DOCS:
        if slug == cur_slug:
            out.append('<a class="doc cur" href="#top">▸ %s<span class="yc">%s</span></a>' % (t, yid))
        elif published and slug in URLS:
            out.append('<a class="doc" href="%s">· %s<span class="yc">%s</span></a>' % (URLS[slug], t, yid))
        else:
            out.append('<span class="doc-flat">· %s<span class="yc">%s</span></span>' % (t, yid))
    out.append('<div class="rail-group">本页</div>')
    for anchor, label in anchors:
        out.append('<a href="#%s">%s</a>' % (anchor, label))
    out.append('<div class="rail-ver">%s · %s</div>' % (VERSION, VERSION_DATE))
    out.append('</nav>')
    return "".join(out)


def page(slug, h1, lede, anchors, body, foot):
    yid = next(i for s, i, t, p in DOCS if s == slug)
    return """<title>%s · %s</title>
<style>%s</style>
<div class="shell" id="top">
%s
<main class="main">
  <div class="page-head">
    <!-- The eyebrow carries what the product actually calls itself in its own
         shell (SHELL_TEXT.brandName), not a Chinese brand name - yucer has
         none. karda has 文渊; brand.ts here holds only displayName "Yucer". -->
    <div class="eyebrow">Vxture Yucer · 销售智能体</div>
    <h1>%s</h1>
    <p class="lede">%s</p>
  </div>
%s
  <div class="foot">%s<br><span class="mono">%s · 文档体系 %s</span></div>
</main>
</div>
<button class="theme-btn" id="themeBtn" type="button">主题</button>
<script>%s</script>
""" % (h1, yid, CSS, rail(slug, anchors), h1, lede, body, foot, yid, VERSION, THEME_JS)
