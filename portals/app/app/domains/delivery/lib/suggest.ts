// What the delivery data can suggest beside the milestone form (owner ruling
// 2026-09-05). Pure functions, refusal built in - see domains/shared/suggest.ts
// for the contract.

/**
 * The next sequence number for a project's milestones.
 *
 * 1-BASED WHEN EMPTY: the first milestone of a project is number 1 the way
 * chapters and contract clauses are, and a suggestion of 0 would read as an
 * off-by-one rather than as a convention. After that it is max+1, holes left
 * alone - a gap in the numbering usually means a milestone was skipped on
 * purpose, and filling it would renumber history.
 */
export function nextSequence(
  milestones: readonly { readonly projectId: string; readonly sequence: number }[],
  projectId: string,
): number {
  const own = milestones.filter((m) => m.projectId === projectId);
  if (own.length === 0) return 1;
  return Math.max(...own.map((m) => m.sequence)) + 1;
}

/**
 * Delivering projects with no milestones at all.
 *
 * The reason it is worth saying: a missed milestone overrides a reported green
 * on project health, so a project with NO milestones has a health nobody can
 * contradict - self-reported and uncheckable. These are the projects the form
 * most needs to hear about.
 */
export function projectsWithoutMilestones(
  projects: readonly { readonly id: string; readonly name: string; readonly status: string }[],
  milestones: readonly { readonly projectId: string }[],
): { id: string; name: string }[] {
  const has = new Set(milestones.map((m) => m.projectId));
  return projects
    .filter((p) => p.status === "delivering" && !has.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));
}
