// What the campaign data can suggest beside the execution form (owner ruling
// 2026-09-05). Pure functions, refusal built in.

/**
 * Campaigns that are running and have no execution items at all.
 *
 * An execution is what a campaign is MADE of - the completion rule refuses to
 * close a campaign while any item is outstanding, and the return figure counts
 * them. A running campaign with zero items is activity nobody has broken into
 * work yet, which is the first thing the form should offer to fix.
 */
export function campaignsWithoutExecutions(
  campaigns: readonly { readonly id: string; readonly name: string; readonly status: string }[],
  executions: readonly { readonly campaignId: string }[],
): { id: string; name: string }[] {
  const has = new Set(executions.map((e) => e.campaignId));
  return campaigns
    .filter((c) => c.status === "running" && !has.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));
}
