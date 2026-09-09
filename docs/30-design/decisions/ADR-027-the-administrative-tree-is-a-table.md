# ADR-027: 行政区划是一张表，从大洲到区县

- Status: accepted
- Date: 2026-09-08
- Deciders: owner
- Supersedes: ADR-026 section D1 ("keep the 34 provinces in the build, with a
  named trigger")

## The trigger fired

ADR-026 wrote the condition down two days ago: the province vocabulary stays a
constant until the product needs a level below province, or per-province
attributes a tenant may edit. The owner asked for the first of those - cities
and counties - so the constant's argument no longer holds:

- 2,978 counties are not something code branches on. Nothing in the rule layer
  says `if (county === "鼓楼区")`, which is exactly the property that kept the
  34 provinces out of a table.
- They are looked up, filtered and joined - "the cities of Jiangsu", "does this
  county exist" - which is what a table is for.
- A build-time array of 3,600 entries would be shipped to every browser that
  loads any page, to answer questions almost none of them ask.

## The shape

One self-referencing table, `yucer_ref.admin_division`, five levels: continent,
country, province, city, county. One table rather than five because the depth is
not uniform - the SARs stop at province level and countries outside China have
no rows below them - and five tables would encode a shape that is true of one
country only.

**Global, not per workspace.** Which provinces China has is not a tenant's
decision. The tenant decision - how a market is carved into 区域 - already has
its own per-workspace tables (incr/0036) and references these names.

**Its own schema.** `yucer_ref` says what it is. A table with no `workspace_id`
sitting among the seven product schemas reads as one somebody forgot to scope.

**Read-only to the service role.** SELECT and nothing else. Administrative
divisions change by decree; a product that can write them can rewrite them by
accident, for every tenant at once, because there is no tenant boundary here.
A change is the next increment.

**Keys.** ISO alpha-2 at levels 1-2, GB/T 2260's six digits at 3-5. They
collide across levels - NA is North America and also Namibia - so the natural
key is `(level, code)` and the parent link is by id.

**Names, three of them, and one code (owner, 2026-09-08).** Every row carries
`abbr_en` (两字母英文简称: AS / CN / GD, null below province), `name_zh`
(中文全称: 中华人民共和国 / 广东省 / 深圳市), `short_zh` (中文简称: 中国 /
广东 / 深圳) and `name_en` (英文全称: Asia / People's Republic of China /
Guangdong, null below province).

Two of those need their limits stated, because a column that is sometimes wrong
is worse than one that is sometimes absent:

- `short_zh` EQUALS `name_zh` where no safe rule applies. 恩施土家族苗族自治州
  has no short form anybody says; dropping the suffix leaves
  恩施土家族苗族, and dropping the ethnic qualifier as well would be writing a
  name rather than shortening one. The rule fires for 省/市/县/区/旗/盟 and for
  the five autonomous regions whose short forms are universal, and refuses
  everywhere else - including the standard's own scaffolding rows (市辖区,
  省直辖县级行政区划), which are not places.
- `name_en` is NULL below province. Romanising 2,978 county names is a
  generation step with its own failure mode - 重庆 is Chongqing, not Zhongqing -
  and a wrong romanisation of a place name is fabricated data, which is the one
  thing this whole batch was built to avoid.

**i18n stops at two languages on purpose.** Chinese and English are what the
product ships; two name columns are the right shape for two. A third locale is
when `admin_division_name (division_id, locale, name, short_name)` earns its
place - a child table, not a third and fourth column. That is the trigger.

**Three more columns, each for a question that already exists.** `path` is the
materialised ancestry (`AS/CN/440000/440300`), so "everything under Guangdong"
is one indexed prefix scan rather than a recursive CTE. `status` is
active/retired, because divisions get abolished (巢湖市, 2011) and a row that
historical records name cannot be deleted. `source` says which of the three
sources produced the row - the table is two datasets plus three hand-seeded
SARs, and a refresh has to tell them apart.

## The rows are generated, and that is part of the decision

`scripts/data/build-admin-division.mjs` pulls two published datasets, each
verified against the integrity hash npm serves for it, and writes the
increment. Nobody hand-edits the seed.

The alternative was typing 3,611 administrative facts from memory. A county
with a wrong code is indistinguishable from a right one until somebody in that
county cannot be filed - so the rows have a source that can be named, and
anyone can re-derive the same file.

Where the source is silent, so are we: the SAR and Taiwan sub-provincial
divisions are not in the Chinese dataset, so those three are seeded at province
level with no children rather than with districts we invented.

## What did NOT move

The 34 province NAMES stay in `domains/shared/provinces.ts` as well, because
two things outside the database are keyed by them: `chk_account_province` and
the map geometry. The table is now a fourth copy, so `admin-division.db.test.ts`
proves the four agree instead of trusting them to.

That is a deliberate exception to "one place for one fact", and it is bounded:
the table is the authority for the tree, the constant is the authority for what
a stored `account.province` may say, and a test fails the moment they diverge.

## Consequences

- `column-locks` gained a third category, `READ_ONLY_TABLES`. The guard used to
  sort every table into writable or append-only, and a SELECT-only table landed
  in the second - which says the application may add rows, the opposite of its
  grant.
- The next levels down (乡镇/街道, 村/居委会) exist in the same source and are
  not seeded. They are two more levels on the same table when a surface needs
  them, not a schema change.
- Nothing in the interface reads the table yet. The province picker still runs
  off the constant; wiring the city and county levels into a surface is its own
  batch, and it is what the table was built for.
