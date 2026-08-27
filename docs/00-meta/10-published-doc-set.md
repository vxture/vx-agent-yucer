# 10-published-doc-set - The published documentation system

**Current release: v1.1, facts as of 2026-08-26 (after batch 6).** The version belongs to the
SET, not to a document: a reader holding YC-201 has to be able to tell whether
the YC-301 beside it was written against the same product, and one number in
every footer answers that. MAJOR moves when a document is added or removed, or
when a decision the set describes is reversed; MINOR moves when facts are
refreshed. The date is the day the facts were READ - a document is only as
current as its last `verify.py` run.

Two documentation layers exist and they are not the same thing.

| Layer | Lives in | Audience | Numbering |
|-------|----------|----------|-----------|
| **Working docs** | `docs/` in this repo | whoever is building | taxonomy decades, `NN-slug.md` |
| **Published set** | Artifacts on claude.ai | anyone across the org | `YC-nnn` |

The working docs are versioned with the code and change with every PR. The
published set is a **reading surface**: it states what is true now, in one
consistent shape, for people who are not going to open the repository. It cites
the working docs as its source and never invents facts they do not carry.

## The catalogue

Ids are **append-only and never reused** - the same discipline the ADR and TD
registers use, and for the same reason: a reference in a liaison letter has to
keep meaning what it meant. The band says roughly what a document is before you
open it.

| Band | Subject |
|------|---------|
| `YC-0xx` | product definition and boundary |
| `YC-1xx` | architecture and layering |
| `YC-2xx` | commerce and gating |
| `YC-3xx` | data and its constraints |
| `YC-4xx` | interface and navigation |

| Id | Document | Release |
|----|----------|-------|
| `YC-001` | 产品现状 | v1.1 |
| `YC-101` | 系统架构 | v1.1 |
| `YC-201` | 能力登记册 | v1.1 |
| `YC-301` | 数据结构 | v1.1 |
| `YC-401` | 界面与导航 | v1.1 |
| `YC-102` | 接口文档 | 未发布 |
| `YC-002` | 审计报告 | 未发布 |

URLs live in `published/urls.json`, which is what wires the rail. An unpublished
document is **rendered in the rail but is not a link** - a dead link teaches the
reader to distrust the rail.

## The visual system is inherited, deliberately

The palette, type scale, rail and component kit are **identical to the Atlas /
Runos / karda documents**. karda states the rule in its own stylesheet, and it
is the right one: a documentation system that changes colour per product is N
products, not one system. yucer identifies itself by the rail brand and by what
its documents say - never by its palette.

What this product does own: the catalogue above, the section structure of each
document, and three components the family kit could not express -

- `.gate` - the two gates as an ordered AND with different behaviour on each
  failure branch, which this product states on every page and route
- `.mx` - the tier x feature and permission x role grids, where the filled
  region has to read as a staircase or the matrix is wrong
- `.lock` - which mechanism holds a rule up. "We agreed not to" and "the
  database refuses" are different guarantees and the marker says which.

## How to rebuild

`published/` is a generator, not five hand-kept HTML files. Consistency across a
set is a property of how the set is produced; nobody sustains it by copying a
header. A document contributes a body and a catalogue entry, nothing else.

```
cd docs/00-meta/published
python3 verify.py     # every figure checked against the source it cites
python3 build.py      # renders <slug>.html for each document
```

`verify.py` is not optional. A document that says "transcribed from
capability.ts" and is not, is worse than one that says nothing - it is a wrong
number wearing a citation. It has already earned its place twice: it caught
`viewer` missing `copilot.use`, and it caught `strategy.approve` transcribed
into the D1 group when the source keeps it last in arrival order - which is
exactly the mistake `YC-201` section 03 warns readers against.

Republish by passing the same file path to the Artifact tool; the URL is stable.
When a NEW document is added, publish it once, add its URL to `urls.json`, then
rebuild and republish the whole set so every rail carries the new link.

## v1.0 定稿记录（2026-08-26）

本次定稿同时落了两次分区级裁定，五份文档全部据此重写：

| | |
|---|---|
| **ADR-017** | 目录成为 D9 能力分区，**不带功能键**。权限 20→23，`incr/0010` |
| **ADR-018** | 证据面不单独售卖（随免费键）；新增 `account.record`。权限 23→24，`incr/0011` |
| 术语 | `能力域` → `能力分区`,`域` 留给五个功能域（ADR-001 更名记录） |
| 功能键 | **冻结在 19**（owner 裁定） |

定稿时的机器校验：`verify.py` 全绿（每个数字对得上源码）、五份标记良构、
锚点无死链、rail 计数正确、版本号在每页页脚与 rail 底部各出现一次。

## v1.1（2026-08-26，批次 6 合并后）

批次 6 把「后端完整、界面接不到」的四个动词全部接上，并新增两条守卫。
五份文档据此更新，改动最大的是 YC-001 第 04 节——它的标题从
**「钱的链路是断的」** 改成 **「钱的链路已接通」**。

| | |
|---|---|
| YC-001 | 第 04/05 节重写；批次表加一行；测试数 1 011 → 1 024 |
| YC-401 | 新增「模块有三种形态」一节，记录面板曾把已建成的说成开发中 |
| YC-201 | D9 目录的页面归属由「待建」改为战略武备域 |
| 全套 | 版本号 v1.0 → v1.1 |

**MINOR 而不是 MAJOR**：文档集没有增减，也没有推翻任何裁定——
只是事实对着仓库刷新了一次。
