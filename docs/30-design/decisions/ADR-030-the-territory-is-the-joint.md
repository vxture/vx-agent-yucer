# ADR-030: 销售区域是关节：挂单位、覆盖大区都按 id，按组织数据范围由此而来

- Status: accepted
- Date: 2026-09-10
- Deciders: owner
- Amends: ADR-029 ("What this batch does NOT do" - the 按组织 data scope is
  built here); incr/0017's design of `territory.regions` as a list of names
  (the column stays, the names are derived now); ADR-020's three scope kinds
  (a fourth, `unit`)

## The ruling

下一步，按组织数据范围，territory 挂到单位，另外在单位是否也显示关联关系。数据
还有关联的区域设定，几个关系如何设计。And on the four points put to the owner:
一个销售区域可挂多个单位；按组织范围 = 本单位子树成员持有的 + 子树区域覆盖的
客户；销售区域与大区的关联这批一起改为 id 关联；关联关系在单位详情、区域表与
表单、区域设定的区域详情三面展示。

## The model: five objects, four relations, one direction each

| Relation | Shape | Where |
|----------|-------|-------|
| 成员 → 单位 | one unit per member | `org_unit_member` (0051) |
| 销售区域 → 单位 | many-to-many; a unit works many territories, a territory may be shared | `territory_unit` (0052) |
| 销售区域 → 大区 | many, BY ID | `territory_division` (0052), replacing the name list |
| 大区 → 省/市 → 客户 | as before | `market_division_member`, `account.region` |

The chain is 成员 → 单位 → 销售区域 → 大区 → 客户. THE TERRITORY IS THE
JOINT: it is the only object that touches both the organisation and the map.
A unit never points at a 大区, and 区域设定 stays what it was - how the market
is cut, knowing nothing of who works it. It shows who does, read-only, because
the owner asked to see the relation from every end.

## Names to ids, and why the column stays

`territory.regions` was a JSONB list of 大区 names matched against
`account.region` (0017). Rename a 大区 and every territory naming it went
quiet; the form even flagged the orphans as 已不在当前划分中. 0052 resolves
each name to the 大区's id once and drops a name no 大区 carries - it was
already covering nothing anyone could see.

The column is not dropped (an increment never removes one) and is no longer
written. The record's `regions` is DERIVED at read time from the links through
the 大区's current name: the Prisma adapter joins `yucer_core.market_division`
(a read-only reference, which is what the partition rule permits and the
foreign key already states); the memory store is handed the account store's
rows by the registry. Every reader of `regions` - lead routing, the scope
resolver, the completeness rule, the coverage assistant - is untouched, and
the one truth they read now follows a rename.

## 按组织 data scope

A fourth scope kind, `unit`. The frame is the member's unit and everything
under it. Visible: rows held by anyone standing in the frame (THE PEOPLE
PATH, checked first and unconditionally - a leader sees their people's work
wherever it is filed), plus the ground of every territory a unit in the frame
works, expanded down the territory tree, with the same three answers the
territory scope gives (customers on that ground, territory owners' unfiled
work, 未分区). Nothing is assigned by hand: being placed in a unit is the
configuration. A member placed nowhere resolves to the queue alone, and the
members page says 未归属 beside the setting rather than let it look applied.

## What goes with what

A link is a pair and CASCADEs with either side. Deleting a unit, or replacing
the tree with a template, detaches the territories that listed it; the
service counts them first and the interface says so. Deleting a 大区 withdraws
its coverage; the confirmation says how many territories lose it before the
click lands. A territory saved with an id outside the workspace is refused in
the product's words (`division_unknown`, `unit_unknown`) before the foreign
key has to.

## Consequences

- `territory.regions` is legacy: written by nothing, read by the migration
  once. A future increment may drop it with a data-architecture note.
- Every domain still speaks in region NAMES at its own boundary; only the
  planning store knows the ids. The account service's routing view, the
  suggest rule and the scope resolver did not change.
- `territory-links.db.test.ts` proves the migration, the CASCADEs, the
  widened CHECK, the pair-only grants and the adapter's derived names.
