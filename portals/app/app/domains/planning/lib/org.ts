import { fail, ok, violation, type RuleResult } from "../../shared/result";

/* 组织结构 - the rules (incr/0051).
 *
 * THE RULING (owner, 2026-09-10): 组织结构是完全可以自定义的；提供平台预置模版，
 * 多套模版作基准；模版覆盖集团型大公司、中规模全国组织、小规模简单团队，默认中
 * 规模全国公司，总部-大区-团队三级架构。
 *
 * WHAT IT IS FOR. The product had three axes and no fourth: a role says what
 * a person may DO, a territory says which GROUND a team works, a 大区 says
 * how the market is CUT - and nothing said which UNIT a person belongs to
 * or who leads it. 数据范围 was hand-picked territory ids per member; there
 * was no reporting line for approvals or hand-overs; 成员管理 could not
 * answer "who is in 华南分公司". This is the fourth axis.
 *
 * NOT A SECOND TREE. 销售区域 already has a parent, an owner and a number - it
 * is "a team working that ground". The organisation is the organisation;
 * a territory is what a unit works, and the link between them is the next
 * batch (按组织 data scope). Nothing here duplicates the territory tree.
 *
 * THE SHAPE, like every configuration here: a unit has a code (the anchor),
 * a name, a KIND from a vocabulary the workspace owns (总部 / 事业部 / 大区 /
 * 分公司 / 团队 shipped; a 中心 is one row away), a parent, a leader (one of
 * the members) and an order among its siblings. A member belongs to ONE
 * unit. Templates are reference rows the workspace is materialised from on
 * first contact and can reset to.
 */

export interface OrgUnitDraft {
  unitCode: string;
  name: string;
  parentId: string | null;
  /** A row of the workspace's 单位类型 vocabulary, by id. */
  kindId: string;
  /** The member who leads it, by sub; null while nobody does. */
  leaderSub: string | null;
}

/** What the rule needs to know about the units already on file. */
export interface KnownOrgUnit {
  readonly id: string;
  readonly unitCode: string;
  readonly parentId: string | null;
}

/** A unit's code: chk_org_unit_code (0051) - the shape every anchor here has. */
export const ORG_UNIT_CODE_SHAPE = /^[a-z][a-z0-9_]{0,63}$/;
/** A kind's code: chk_org_unit_kind_code (0051), 32 characters. */
export const ORG_KIND_CODE_SHAPE = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * Validate a unit before it is written.
 *
 * UPSERT BY CODE, like a territory: the code is immutable in the DDL and
 * absent from the writable columns, so an existing code is edited and a new
 * one created. The parent has to exist, and may not be the unit itself or
 * anything under it - a cycle is legal to the foreign key and nonsense to
 * every reader of the tree.
 */
export function planOrgUnit(
  input: OrgUnitDraft,
  existing: readonly KnownOrgUnit[],
  kindIds: ReadonlySet<string>,
): RuleResult<OrgUnitDraft> {
  const unitCode = input.unitCode.trim();
  const name = input.name.trim();
  if (!unitCode) return fail(violation("code_required", "a unit needs a code", "unitCode"));
  if (!ORG_UNIT_CODE_SHAPE.test(unitCode)) {
    return fail(violation("code_shape", `${unitCode}: a unit code is lower-case letters, digits and underscores`, "unitCode"));
  }
  if (!name) return fail(violation("name_required", "a unit needs a name", "name"));
  if (!kindIds.has(input.kindId)) {
    return fail(violation("kind_unknown", `${input.kindId} is not a unit kind of this workspace`, "kindId"));
  }
  const self = existing.find((u) => u.unitCode === unitCode) ?? null;
  if (input.parentId !== null) {
    const parent = existing.find((u) => u.id === input.parentId);
    if (!parent) return fail(violation("parent_not_found", "the parent unit does not exist", "parentId"));
    if (self && (parent.id === self.id || reaches(existing, parent.id, self.id))) {
      return fail(violation("parent_cycle", "a unit cannot sit under itself, directly or through a chain", "parentId"));
    }
  }
  return ok({ ...input, unitCode, name, leaderSub: input.leaderSub?.trim() || null });
}

/** Whether following parent links from `fromId` ever arrives at `targetId`. */
export function reaches(all: readonly KnownOrgUnit[], fromId: string, targetId: string): boolean {
  const byId = new Map(all.map((u) => [u.id, u]));
  const seen = new Set<string>();
  let cursor: string | null = fromId;
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === targetId) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

/** The ids of `id` and everything under it, in tree order. */
export function subtreeIds(all: readonly KnownOrgUnit[], id: string): string[] {
  const out: string[] = [];
  const walk = (parent: string) => {
    out.push(parent);
    for (const u of all) if (u.parentId === parent) walk(u.id);
  };
  walk(id);
  return out;
}

/** The territories any unit in `unitIds` works, deduplicated - the frame a
 *  unit-scoped leader's territory reach reduces to (resolve-scope.ts's
 *  `unit` branch) and what the org-panel table shows per unit, so the two
 *  read the same ground and cannot silently drift apart. */
export function territoriesWorkedBy(
  territories: readonly { readonly id: string; readonly unitIds: readonly string[] }[],
  unitIds: ReadonlySet<string> | readonly string[],
): string[] {
  const frame = unitIds instanceof Set ? unitIds : new Set(unitIds);
  return territories.filter((t) => t.unitIds.some((u) => frame.has(u))).map((t) => t.id);
}

/** The territories `id`'s own subtree works - what a leader stationed at
 *  `id` actually sees under 按组织 data-scope, not just what is directly
 *  linked to `id` itself. A unit whose subtree reaches EVERY territory the
 *  workspace has is, in effect, unrestricted (owner, 2026-09-11: 高层组织和
 *  领导角色需要能跟"真正没有权限"区分开 - 总部/事业部这类顶层单位此前显示
 *  "无区域"，跟真的没有关联区域没法区分). */
export function subtreeTerritoryIds(
  units: readonly KnownOrgUnit[],
  territories: readonly { readonly id: string; readonly unitIds: readonly string[] }[],
  id: string,
): string[] {
  return territoriesWorkedBy(territories, subtreeIds(units, id));
}

export interface EffectiveTerritories {
  readonly territoryIds: readonly string[];
  /** The ancestor `territoryIds` actually came from, when `id`'s own
   *  subtree had none - null when they are `id`'s own (or its own
   *  descendants'). */
  readonly inheritedFrom: string | null;
}

/** `id`'s EFFECTIVE territory reach: its own subtree's aggregate
 *  (subtreeTerritoryIds) when that is non-empty, otherwise the nearest
 *  ancestor whose own subtree reaches something (owner, 2026-09-11: 下级
 *  没有设置区域，应该显示/生效为继承上级 - a leaf unit with nothing of its
 *  own is not thereby unauthorized, it works whatever ground the nearest
 *  ancestor above it already covers). Consumed identically by
 *  resolve-scope.ts's `unit` branch (what a leader placed here actually
 *  sees) and the org-panel table (what it shows), so a member's real data
 *  scope and the badge describing it cannot read differently. */
export function effectiveTerritoryIds(
  units: readonly KnownOrgUnit[],
  territories: readonly { readonly id: string; readonly unitIds: readonly string[] }[],
  id: string,
): EffectiveTerritories {
  const own = subtreeTerritoryIds(units, territories, id);
  if (own.length > 0) return { territoryIds: own, inheritedFrom: null };
  const byId = new Map(units.map((u) => [u.id, u]));
  let cursor = byId.get(id)?.parentId ?? null;
  while (cursor !== null) {
    const reach = subtreeTerritoryIds(units, territories, cursor);
    if (reach.length > 0) return { territoryIds: reach, inheritedFrom: cursor };
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return { territoryIds: [], inheritedFrom: null };
}

/**
 * The shipped 单位类型 - what a workspace's vocabulary starts from. Mirrored
 * from incr/0051; org.test.ts holds the two in lockstep.
 */
export const DEFAULT_ORG_KINDS: readonly { readonly code: string; readonly name: string }[] = [
  { code: "headquarters", name: "总部" },
  { code: "division", name: "事业部" },
  { code: "region", name: "大区" },
  { code: "branch", name: "分公司" },
  { code: "team", name: "团队" },
];

export interface OrgTemplateUnit {
  readonly code: string;
  readonly parent: string | null;
  readonly kind: string;
  readonly name: string;
}

export interface OrgTemplate {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly isDefault: boolean;
  /** In tree order: a parent always precedes its children. */
  readonly units: readonly OrgTemplateUnit[];
}

/**
 * The three shipped templates, mirrored from incr/0051 (yucer_ref.org_template
 * / org_template_unit) the way the presets mirror their seed: the memory
 * store offers these; the Prisma store reads the table; org.test.ts holds
 * them equal. 中规模全国公司 is the default - 总部 → 大区 → 团队, the seven
 * regions the 七分法 carve names.
 */
export const ORG_TEMPLATES: readonly OrgTemplate[] = [
  {
    key: "group_large", name: "集团型大公司", description: "集团总部 → 事业部 → 大区 → 分公司 → 团队，五级；两个事业部各带三个大区作骨架，改名即用。", isDefault: false,
    units: [
      { code: "headquarters", parent: null, kind: "headquarters", name: "集团总部" },
      { code: "bu1", parent: "headquarters", kind: "division", name: "事业部一" },
      { code: "bu1_north", parent: "bu1", kind: "region", name: "华北大区" },
      { code: "bu1_north_branch", parent: "bu1_north", kind: "branch", name: "华北分公司" },
      { code: "bu1_north_team1", parent: "bu1_north_branch", kind: "team", name: "销售一部" },
      { code: "bu1_east", parent: "bu1", kind: "region", name: "华东大区" },
      { code: "bu1_east_branch", parent: "bu1_east", kind: "branch", name: "华东分公司" },
      { code: "bu1_east_team1", parent: "bu1_east_branch", kind: "team", name: "销售一部" },
      { code: "bu1_south", parent: "bu1", kind: "region", name: "华南大区" },
      { code: "bu1_south_branch", parent: "bu1_south", kind: "branch", name: "华南分公司" },
      { code: "bu1_south_team1", parent: "bu1_south_branch", kind: "team", name: "销售一部" },
      { code: "bu2", parent: "headquarters", kind: "division", name: "事业部二" },
      { code: "bu2_north", parent: "bu2", kind: "region", name: "华北大区" },
      { code: "bu2_north_branch", parent: "bu2_north", kind: "branch", name: "华北分公司" },
      { code: "bu2_north_team1", parent: "bu2_north_branch", kind: "team", name: "销售一部" },
      { code: "bu2_east", parent: "bu2", kind: "region", name: "华东大区" },
      { code: "bu2_east_branch", parent: "bu2_east", kind: "branch", name: "华东分公司" },
      { code: "bu2_east_team1", parent: "bu2_east_branch", kind: "team", name: "销售一部" },
      { code: "bu2_south", parent: "bu2", kind: "region", name: "华南大区" },
      { code: "bu2_south_branch", parent: "bu2_south", kind: "branch", name: "华南分公司" },
      { code: "bu2_south_team1", parent: "bu2_south_branch", kind: "team", name: "销售一部" },
    ],
  },
  {
    key: "national_medium", name: "中规模全国公司", description: "总部 → 大区 → 团队，三级；七个大区与七分法一致，每区一个销售团队。默认方案。", isDefault: true,
    units: [
      { code: "headquarters", parent: null, kind: "headquarters", name: "总部" },
      { code: "north", parent: "headquarters", kind: "region", name: "华北大区" },
      { code: "north_team1", parent: "north", kind: "team", name: "销售一部" },
      { code: "northeast", parent: "headquarters", kind: "region", name: "东北大区" },
      { code: "northeast_team1", parent: "northeast", kind: "team", name: "销售一部" },
      { code: "east", parent: "headquarters", kind: "region", name: "华东大区" },
      { code: "east_team1", parent: "east", kind: "team", name: "销售一部" },
      { code: "central", parent: "headquarters", kind: "region", name: "华中大区" },
      { code: "central_team1", parent: "central", kind: "team", name: "销售一部" },
      { code: "south", parent: "headquarters", kind: "region", name: "华南大区" },
      { code: "south_team1", parent: "south", kind: "team", name: "销售一部" },
      { code: "southwest", parent: "headquarters", kind: "region", name: "西南大区" },
      { code: "southwest_team1", parent: "southwest", kind: "team", name: "销售一部" },
      { code: "northwest", parent: "headquarters", kind: "region", name: "西北大区" },
      { code: "northwest_team1", parent: "northwest", kind: "team", name: "销售一部" },
    ],
  },
  {
    key: "small_team", name: "小规模简单团队", description: "总部下直接是销售、售前、交付三个团队，两级。", isDefault: false,
    units: [
      { code: "headquarters", parent: null, kind: "headquarters", name: "总部" },
      { code: "sales", parent: "headquarters", kind: "team", name: "销售团队" },
      { code: "presales", parent: "headquarters", kind: "team", name: "售前团队" },
      { code: "delivery", parent: "headquarters", kind: "team", name: "交付团队" },
    ],
  },
];

/**
 * 大区级组织结构也需要创建并关联 (owner, 2026-09-11): applying 五分法/七分法
 * alongside an org template should not just LINK whatever region-shaped units
 * the org template happens to already have - for 国规模全国公司 that is a
 * lucky 1:1 with 七分法 (the template's own description says so) and for
 * 五分法 it is nothing, every unit named "华北大区" etc has no "东部"-style
 * counterpart at all. The org template's own 大区 units are regenerated to
 * match whichever division template was actually chosen, key'd here by which
 * unit(s) the regions attach under - 国规模全国公司 has one trunk (总部),
 * 集团型大公司 keeps its two 事业部 and gives each the full region set.
 *
 * 小规模简单团队 IS NOT HERE ON PURPOSE (owner: 小公司就不用了=默认禁用) -
 * it has no 大区 layer at all (总部 直接带三个团队), so there is nothing to
 * regenerate; a region choice paired with it is a no-op higher up, not
 * something this map needs to refuse.
 */
export const REGION_AWARE_ORG_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  national_medium: ["headquarters"],
  group_large: ["bu1", "bu2"],
};

/** The three levels a static template's own 大区 arm is made of - dropped
 *  wholesale before the dynamic ones are generated in their place. */
const REGION_ARM_KINDS = new Set(["region", "branch", "team"]);

/** One 大区 unit named after `r`, plus ONE team under it (owner, 2026-09-11:
 *  上下级可以按模版保持现状即可，就是可以保持2个事业部，下级各一个单位 -
 *  the attachment point stays wherever the static template already put its
 *  大区 arm; what is UNDER a region flattens to this one unit, not the
 *  deeper 分公司 → 团队 chain 集团型大公司's own three fixed regions still
 *  carry - replicating that chain once per matched region, twice per 事业部,
 *  would run to dozens of units for what is meant to be a light sync).
 *  Division codes are `CHINA-EAST`-shaped; a unit code is lower-case,
 *  underscored, and unique per parent, hence the transform. */
function regionUnits(parentCode: string, regions: readonly { readonly code: string; readonly name: string }[]): OrgTemplateUnit[] {
  const out: OrgTemplateUnit[] = [];
  for (const r of regions) {
    const slug = r.code.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const regionCode = `${parentCode}_${slug}`;
    out.push({ code: regionCode, parent: parentCode, kind: "region", name: `${r.name}大区` });
    out.push({ code: `${regionCode}_team1`, parent: regionCode, kind: "team", name: "销售一部" });
  }
  return out;
}

/**
 * `template` with its own 大区 arm (region/branch/team units) replaced by
 * one region - plus the one team under it - per entry in `regions`, under
 * every parent `REGION_AWARE_ORG_TEMPLATES` lists for this template's key.
 * `template` comes back unchanged when its key is not in that map (小规模
 * 简单团队, or any future template nobody has opted in) or `regions` is
 * empty (不同步 - no division template chosen, today's behaviour).
 */
export function withMatchedRegions(
  template: OrgTemplate,
  regions: readonly { readonly code: string; readonly name: string }[],
): OrgTemplate {
  const parents = REGION_AWARE_ORG_TEMPLATES[template.key];
  if (!parents || regions.length === 0) return template;
  const trunk = template.units.filter((u) => !REGION_ARM_KINDS.has(u.kind));
  const generated = parents.flatMap((p) => regionUnits(p, regions));
  return { ...template, units: [...trunk, ...generated] };
}

export function defaultOrgTemplate(templates: readonly OrgTemplate[] = ORG_TEMPLATES): OrgTemplate {
  return templates.find((t) => t.isDefault) ?? templates[0]!;
}
