/* 组织视图 - the members laid out under the organisation (owner, 2026-09-10:
 * 组织视图，按照组织架构布局，只显示主名称，人员归入在组织之下; then: 按组织视图
 * 不是树状结构吗，差别就是在各单位内可以添加成员).
 *
 * PURE: the tree comes in as the flat, tree-ordered unit list the planning
 * service gives, the people as the roster rows, and out comes the nesting
 * the view draws - each unit with the people placed THERE (not the subtree:
 * a person shows once per unit they are in, under that unit, which since
 * 0053 may be several) and its child units, in the order the tree keeps.
 * Whoever is placed nowhere is listed apart, so nobody disappears from the
 * organisation view for the crime of not having been filed yet.
 *
 * `flattenOrgView` turns that nesting back into the rows a tree TABLE draws
 * - the shape 组织结构 has - honouring which branches are folded.
 */

export interface OrgViewUnit {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  /** The territories this unit works (0052), by name. */
  readonly territories: readonly string[];
}

export interface OrgViewPerson {
  readonly sub: string;
  readonly name: string;
  readonly status: string;
  readonly unitIds: readonly string[];
  /** Their data scope kind (0022 / 0052). */
  readonly scope: string;
  /** Assigned territories, by name - for the territory scope. */
  readonly territories: readonly string[];
}

export interface OrgViewNode {
  readonly id: string;
  readonly name: string;
  readonly territories: readonly string[];
  /** The people placed in THIS unit, in roster order. */
  readonly people: readonly OrgViewPerson[];
  readonly children: readonly OrgViewNode[];
}

export interface OrgView {
  readonly roots: readonly OrgViewNode[];
  /** Placed in no unit at all. */
  readonly unplaced: readonly OrgViewPerson[];
}

export function buildOrgView(units: readonly OrgViewUnit[], people: readonly OrgViewPerson[]): OrgView {
  const known = new Set(units.map((u) => u.id));
  const byUnit = new Map<string, OrgViewPerson[]>();
  const unplaced: OrgViewPerson[] = [];
  for (const p of people) {
    const here = p.unitIds.filter((id) => known.has(id));
    if (here.length === 0) unplaced.push(p);
    for (const id of here) (byUnit.get(id) ?? byUnit.set(id, []).get(id)!).push(p);
  }
  const build = (parentId: string | null): OrgViewNode[] =>
    units
      .filter((u) => u.parentId === parentId)
      .map((u) => ({ id: u.id, name: u.name, territories: u.territories, people: byUnit.get(u.id) ?? [], children: build(u.id) }));
  // A unit whose parent is not in the list (should not happen: the FK) is
  // shown as a root rather than lost.
  const roots = [
    ...build(null),
    ...units.filter((u) => u.parentId !== null && !known.has(u.parentId)).map((u) => ({ id: u.id, name: u.name, territories: u.territories, people: byUnit.get(u.id) ?? [], children: build(u.id) })),
  ];
  return { roots, unplaced };
}

/**
 * One row of the tree table (owner, 2026-09-10: 每个人是一行，与组织是同级的
 * 行; 同级下方，先全部组织，再人员). A unit, or a person placed in one - the
 * person's row id carries the unit, since 0053 lets the same person appear
 * under several.
 */
export type OrgViewRow =
  | {
      readonly kind: "unit";
      readonly id: string;
      readonly name: string;
      readonly depth: number;
      /** Units directly under this one. */
      readonly children: number;
      /** People placed HERE. */
      readonly headcount: number;
      readonly territories: readonly string[];
      /** The pseudo-unit listing whoever is placed nowhere. Takes nobody. */
      readonly unplaced: boolean;
    }
  | {
      readonly kind: "person";
      readonly id: string;
      readonly sub: string;
      readonly name: string;
      readonly status: string;
      readonly depth: number;
      /** The unit this row sits under; null under 未归属. */
      readonly unitId: string | null;
      readonly scope: string;
      readonly territories: readonly string[];
    };

export const UNPLACED_ROW_ID = "__unplaced__";

/** A person's row id under a unit - the pair, as the table is. */
export function personRowId(unitId: string | null, sub: string): string {
  return `${unitId ?? UNPLACED_ROW_ID}:${sub}`;
}

/**
 * Tree order, indented by depth, with everything under a folded row left
 * out. Under a unit: its child units FIRST (each with its own subtree), then
 * the people placed in it. The 未归属 row comes last, at depth 0, with its
 * people under it, and only when somebody is there.
 */
export function flattenOrgView(view: OrgView, collapsed: ReadonlySet<string>): OrgViewRow[] {
  const out: OrgViewRow[] = [];
  const people = (unitId: string | null, list: readonly OrgViewPerson[], depth: number) => {
    for (const p of list) out.push({ kind: "person", id: personRowId(unitId, p.sub), sub: p.sub, name: p.name, status: p.status, depth, unitId, scope: p.scope, territories: p.territories });
  };
  const walk = (node: OrgViewNode, depth: number) => {
    out.push({ kind: "unit", id: node.id, name: node.name, depth, children: node.children.length, headcount: node.people.length, territories: node.territories, unplaced: false });
    if (collapsed.has(node.id)) return;
    for (const c of node.children) walk(c, depth + 1);
    people(node.id, node.people, depth + 1);
  };
  for (const r of view.roots) walk(r, 0);
  if (view.unplaced.length > 0) {
    out.push({ kind: "unit", id: UNPLACED_ROW_ID, name: "", depth: 0, children: 0, headcount: view.unplaced.length, territories: [], unplaced: true });
    if (!collapsed.has(UNPLACED_ROW_ID)) people(null, view.unplaced, 1);
  }
  return out;
}

/** Every row that can fold - a unit with anything under it, and 未归属. */
export function branchIds(view: OrgView): string[] {
  const out: string[] = [];
  const walk = (node: OrgViewNode) => {
    if (node.children.length > 0 || node.people.length > 0) out.push(node.id);
    for (const c of node.children) walk(c);
  };
  for (const r of view.roots) walk(r);
  if (view.unplaced.length > 0) out.push(UNPLACED_ROW_ID);
  return out;
}

/** The units in tree order with their depth - for a unit select. */
export function unitOptions(view: OrgView): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  const walk = (node: OrgViewNode, depth: number) => {
    out.push({ id: node.id, name: node.name, depth });
    for (const c of node.children) walk(c, depth + 1);
  };
  for (const r of view.roots) walk(r, 0);
  return out;
}
