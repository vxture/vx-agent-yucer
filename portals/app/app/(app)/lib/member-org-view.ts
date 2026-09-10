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
}

export interface OrgViewPerson {
  readonly sub: string;
  readonly name: string;
  readonly status: string;
  readonly unitIds: readonly string[];
}

export interface OrgViewNode {
  readonly id: string;
  readonly name: string;
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
      .map((u) => ({ id: u.id, name: u.name, people: byUnit.get(u.id) ?? [], children: build(u.id) }));
  // A unit whose parent is not in the list (should not happen: the FK) is
  // shown as a root rather than lost.
  const roots = [
    ...build(null),
    ...units.filter((u) => u.parentId !== null && !known.has(u.parentId)).map((u) => ({ id: u.id, name: u.name, people: byUnit.get(u.id) ?? [], children: build(u.id) })),
  ];
  return { roots, unplaced };
}

/** One row of the tree table: a unit at its depth, or the 未归属 row last. */
export interface OrgViewRow {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly people: readonly OrgViewPerson[];
  /** Units directly under this one - a chevron when more than none. */
  readonly children: number;
  /** The row that lists whoever is placed nowhere. Not a unit; takes nobody. */
  readonly unplaced: boolean;
}

export const UNPLACED_ROW_ID = "__unplaced__";

/**
 * Tree order, indented by depth, with the rows under a folded branch left
 * out - the same walk 组织结构's roster does. The 未归属 row comes last, at
 * depth 0, and only when somebody is there.
 */
export function flattenOrgView(view: OrgView, collapsed: ReadonlySet<string>): OrgViewRow[] {
  const out: OrgViewRow[] = [];
  const walk = (node: OrgViewNode, depth: number) => {
    out.push({ id: node.id, name: node.name, depth, people: node.people, children: node.children.length, unplaced: false });
    if (collapsed.has(node.id)) return;
    for (const c of node.children) walk(c, depth + 1);
  };
  for (const r of view.roots) walk(r, 0);
  if (view.unplaced.length > 0) {
    out.push({ id: UNPLACED_ROW_ID, name: "", depth: 0, people: view.unplaced, children: 0, unplaced: true });
  }
  return out;
}

/** Every unit that has units under it - what 全部收起 folds. */
export function branchIds(view: OrgView): string[] {
  const out: string[] = [];
  const walk = (node: OrgViewNode) => {
    if (node.children.length > 0) out.push(node.id);
    for (const c of node.children) walk(c);
  };
  for (const r of view.roots) walk(r);
  return out;
}
