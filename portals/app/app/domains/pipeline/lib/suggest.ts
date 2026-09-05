// What the pipeline data can suggest beside the new-deal form (owner ruling
// 2026-09-05). Pure functions, refusal built in.

/**
 * Active customers with no open deal on the board.
 *
 * The account picker's most useful ordering is not alphabetical - it is "who
 * are we working that we are not selling to". A customer with contacts, a
 * plan, interactions and NO open opportunity is exactly where a corridor deal
 * gets heard about first; the strategic prospect with nothing on the board is
 * this product's own demo case (acc_demo_3).
 */
export function accountsWithoutOpenDeal(
  accounts: readonly { readonly id: string; readonly name: string; readonly status: string }[],
  opportunities: readonly { readonly accountId: string; readonly status: string }[],
): { id: string; name: string }[] {
  const open = new Set(opportunities.filter((o) => o.status === "open").map((o) => o.accountId));
  return accounts
    .filter((a) => a.status !== "churned" && !open.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }));
}
