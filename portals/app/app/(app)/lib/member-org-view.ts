/* 组织视图 - the members laid out under the organisation (owner, 2026-09-10:
 * 组织视图，按照组织架构布局，只显示主名称，人员归入在组织之下).
 *
 * PURE: the tree comes in as the flat, tree-ordered unit list the planning
 * service gives, the people as the roster rows, and out comes the nesting
 * the view draws - each unit with the people placed THERE (not the subtree:
 * a person shows once per unit they are in, under that unit, which since
 * 0053 may be several) and its child units, in the order the tree keeps.
 * Whoever is placed nowhere is listed apart, so nobody disappears from the
 * organisation view for the crime of not having been filed yet.
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
