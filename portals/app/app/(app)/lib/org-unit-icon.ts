import type { IconName } from "@vxture/design-ui";

// 组织单位的图标 - shared by 组织架构 (org-panel.tsx, both its list and cards
// views) and 组织管理 (member-org-view.tsx), the two admin surfaces that draw
// the org tree. One rule, one place: the two pages drifting apart is exactly
// how the tree read "no hierarchy at all" in the first place (owner,
// 2026-09-12: 现在统一为 building 不合理).
//
// DEPTH ALONE WAS TOO ABSOLUTE (owner, same day, second pass): a depth-2+
// unit with no units of its own is a team, and a people icon already said so
// correctly. It is a depth-2+ unit that STILL BRANCHES (a department over
// departments) that had no icon of its own and fell into the same bucket as
// a plain team. L0/L1 stay depth-only - a branch is what they are, a
// headquarters or a regional office, empty or not; L2 and deeper reads
// `children` instead of how deep it sits. Four icons total: three for
// "this still branches" (L0/L1/L2+), one for "this is a leaf".
export function orgUnitIcon(r: { readonly depth: number; readonly children: number }): IconName {
  if (r.depth === 0) return "buildings";
  if (r.depth === 1) return "building";
  return r.children > 0 ? "tree-structure" : "users";
}
