# ADR-026: What is a table and what is a constant

- Status: accepted
- Date: 2026-09-08
- Deciders: owner
- Context: owner asked for a full sweep - everything should be a database table,
  and anything left in a file needs a stated reason and a decision.

## The question

"Put the data in tables" is right, and it is not a sweep that can be run
blindly: this repository holds several kinds of thing that all LOOK like data
in a text editor, and only some of them are.

The test that separates them is not size or shape. It is **who may change it
and what breaks when they do**:

- If a TENANT may change it and the product keeps working, it is data. It goes
  in a table, per workspace.
- If changing it requires a code change to remain correct - because the rule
  layer branches on the value, or the compiler checks it, or a shape has to
  exist for it - it is not data. It is the product, and it belongs in the build
  with the database CHECK-constraining what may reach the column.

Everything below is classified by that test.

## A. Already tables - tenant data and tenant-editable configuration

No action. 55 tables across ten schemas, of which the configuration ones are:

| Table | What a tenant does with it |
|---|---|
| `yucer_catalog.product_type` / `product_status` / `product_unit` | renames, reorders, adds and deletes its own product vocabulary (0028 / 0029 / 0037) |
| `yucer_core.market_division` + `market_division_province` | carves its own market; a province belongs to one region, enforced by the PK (0036) |
| `yucer_gtm.territory` / `market_segment` / `sales_target` | its own teams, segments and numbers |
| `local_authz.member_role` | who holds which role |
| `yucer_agent.agent_autonomy` / `judgement_snooze` | per-workspace switches |

## B. In the build, CHECK-mirrored - closed enums

`STAGES`, `FORECAST_CATEGORIES`, `MILESTONE_STATUSES`, `REVENUE_STATUSES`,
`ACTION_STATUSES`, `AUTONOMY_MODES`, `TARGET_METRICS`, `TARGET_STATUSES`,
`EXIT_REASONS`, `WIN_LOSS_REASONS`, `SYSTEM_STATUS_CODES`, `SUBJECT_TYPES`,
`URGENCIES`. 111 CHECK constraints stand behind them.

**Reason: the rule layer branches on every value.** `planStageChange` knows what
`won` means; `planCategoryChange` knows that `commit` is not a stage; the
instalment rules know `settled` is terminal and `overdue` is not. A tenant row
saying `stage = 'negotiating_hard'` would reach code that has no branch for it,
and the failure would not be a refusal - it would be a deal that silently stops
appearing in a funnel.

**Decision: KEEP IN THE BUILD.** The CHECK is the enforcement, the constant is
what the compiler checks, and the mirror tests prove the two lists match. A
value is added by changing the DDL and the constant in one commit, which is the
review that a state machine deserves.

## C. In the build AND seeded - catalogues the product ships

| Constant | Seeded by | Why both |
|---|---|---|
| `authz/catalog.ts` - 25 permissions, 9 roles, 117 grants | `incr/0001`, `0002`, `0010`, `0011`, `0012`, `0021` | the gate runs IN PROCESS on every render and every action; a database round trip per permission check would put a join in front of every button |
| `DIVISION_TEMPLATES` - the five-way and seven-way carves | `incr/0036` | the shipped defaults must exist before a workspace has rows, and the import materialises them into that workspace's own table |
| `DEFAULT_TYPE_VOCABULARY` / `DEFAULT_UNIT_VOCABULARY` / status set | `incr/0028` / `0037` / `0029` | same: a delivered tenant is a USABLE product, not an empty one |

**Decision: KEEP BOTH, mirrored.** The database is the authority; the constant
is a copy that tests parse the seed to verify, in both directions. This is the
lockstep the repo already runs for column locks.

## D. In the build with no table - and the reason for each

### D1. The 34 province names and their two-letter codes

`domains/shared/provinces.ts`, mirrored by `chk_account_province` (0035) and by
the map geometry's keys.

**Reason.** Three things have to agree exactly - the vocabulary, the CHECK, and
a drawn shape - and only two of them can live in a table. A province with no
shape draws nothing on the situation screen and reads as "no business there";
`provinces.test.ts` is what makes the three provable against each other.
Provincial-level divisions also change roughly never.

**Decision: KEEP, with a named trigger.** It becomes
`yucer_core.admin_division` (self-referencing parent_id, seeded, with the codes
as columns) the first time the product needs EITHER of:

- a level below province (city / district), or
- per-province attributes a tenant may edit (aliases, sort order, enablement).

Until then a table would add a join to every read and buy nothing: nobody may
edit these, and a fourth copy of the same 34 names is a fourth chance to drift.

### D2. The map's vector data

`(screen)/lib/china-geometry.ts`, 111KB.

**It is a file in this repository, and there is no online map service.** No
tile server, no Mapbox/AMap/ECharts, no runtime `fetch` - the situation screen
draws SVG paths that ship in the bundle. Generated from Aliyun DataV's published
province boundaries (areas_v3), projected to Albers Equal Area Conic
(25N/47N, 105E) and simplified with Douglas-Peucker at 3km: 569KB of GeoJSON
became 107KB of path data with no visible loss at screen size.

**Reason: it is a rendering asset, not data.** Nobody edits it, it is keyed by
the province vocabulary rather than joined to anything, and it is identical for
every tenant. In Postgres it would be a 111KB blob shipped over the wire on
every screen load, to be turned back into exactly the same paths.

**Decision: KEEP AS A BUILD ASSET.** Regenerate from the source rather than
hand-patching a path. It stays offline on purpose: a private deployment must
draw the country without reaching a third party, and a map that fails to load
is a screen that lies about coverage.

### D3. Interface copy - `messages.ts` / `messages.en.ts`

**Reason: TD-002.** Copy is reviewed with the code that renders it, and a
message key is checked by the compiler at the call site. A translation table is
a content system - a different product, with its own editor, review and cache.

**Decision: KEEP.** Revisit only if translation stops being a developer task.

### D4. The route catalogue - `navigation.ts`, `functional-domains.ts`, `admin-nav.ts`

**Reason: routes are code.** An entry naming a page that does not exist is a
broken menu, and `routes.test.ts` can only prove that against the filesystem.

**Decision: KEEP.**

### D5. The commercial matrix - `entitlement/capability.ts`

19 feature keys x 5 tiers, frozen (owner, 2026-08-26).

**Reason: a workspace must not be able to edit what it bought.** The tier
arrives from the platform over C2; the matrix is this product's definition of
what each tier includes. In a per-workspace table, "which features do we have"
would become editable by the tenant being gated.

**Decision: KEEP IN THE BUILD.** If a per-tenant override is ever needed it
belongs on the PLATFORM side of C2, not in this database.

### D6. `column-locks.ts`

**Reason: it is deliberately a mirror** of the DDL grants, and the third
reference point (the CREATE TABLE statements) is what caught a grant naming a
column that did not exist. A table would be the thing it is checking.

**Decision: KEEP.**

### D7. Demo fixtures - `demo-fixtures.ts`, `demo-seed.ts`, `demo-national.ts`

**Reason: they exist precisely for the run with no database.** `prismaEnabled()`
is false without `DATABASE_URL`, and these seed the in-memory stores so the
product is reviewable before a database exists.

**Decision: KEEP.** They are fixtures, not tenant data.

### D8. Rule parameters - `COMMIT_PROBABILITY`, `BEST_CASE_PROBABILITY`, `ANALYSES`

**Reason: each is a number or a list the rule layer reasons WITH**, not one it
looks up. The 80/50 thresholds are argued in the code beside the rule that uses
them; `ANALYSES` names four model calls that each need an implementation.

**Decision: KEEP, with a trigger.** The thresholds become a per-workspace table
the day a tenant must tune them without a deploy - that is a forecast-rule
configuration surface, and it is a batch of its own, not a sweep.

## Consequences

- Nothing moves today. The sweep's finding is that the tenant-editable data is
  already in tables, and every remaining constant is either a state machine the
  code branches on, a mirror the tests hold to the database, or an asset.
- Two triggers are now written down rather than remembered: administrative
  divisions below province level (D1), and tenant-tunable rule thresholds (D8).
- The map's independence from any online service is a stated property of the
  product, not an accident of how it was built.
