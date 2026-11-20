import { can } from "../../authz/decide";
import { analyzeChain, REQUIRED_ROLES } from "../account/lib/health";
import { chainForOpportunity } from "../account/lib/buying-role";
import type { AccountStore, ContactRecord } from "../account/store";
import { listPipeline } from "../pipeline/service";
import type { FocusContext } from "./focus-read";
import type { FocusCoverage, FocusRow } from "./focus-model";

type Deal = { id: string; accountId: string };
type Links = Awaited<ReturnType<AccountStore["listOpportunityContactsFor"]>>;

/** Live, authorized buying committees, not a historical planning snapshot.
 * The caller has already scoped rows through listAccounts. Pipeline is also
 * session-scoped; never read role links for arbitrary or hidden opportunity IDs.
 * Read opportunities and role links once; bound per-account graph concurrency.
 */
export async function readFocusCoverage(ctx: FocusContext, rows: FocusRow[], contacts?: ReadonlyMap<string, ContactRecord[]>) {
  if (!rows.length) return;
  for (const row of rows) row.coverage = { state: "unavailable" };
  const allowed = ["account.graph.view", "pipeline.view"] as const;
  if (!allowed.every(action => can(ctx.holder, ctx.entitlement, action, "data").allowed)) {
    for (const row of rows) row.coverage = { state: "denied" };
    return;
  }
  if (!ctx.pipeline) return;
  try {
    const result = await listPipeline({ ...ctx, store: ctx.pipeline }, { includeClosed: false });
    if (!result.ok) return;
    await projectCoverage(ctx, rows, result.value, contacts);
  } catch {
    // Keep unavailable distinct from genuine zero coverage; preserve readable rows.
  }
}

async function projectCoverage(ctx: FocusContext, rows: FocusRow[], source: (Deal & { status: string })[], contacts?: ReadonlyMap<string, ContactRecord[]>) {
  const ids = new Set(rows.map(row => row.id));
  const deals = source.filter(deal => deal.status === "open" && ids.has(deal.accountId));
  const byAccount = new Map<string, Deal[]>();
  for (const deal of deals) {
    const group = byAccount.get(deal.accountId) ?? [];
    group.push(deal); byAccount.set(deal.accountId, group);
  }
  // Empty opportunity sets are known gaps, independent of the links source.
  for (const row of rows) if (!byAccount.has(row.id)) row.coverage = summarize([]);
  if (!deals.length) return;
  const links = await ctx.accounts.listOpportunityContactsFor(ctx.workspaceId, deals.map(deal => deal.id));
  const byDeal = new Map<string, Links>();
  for (const link of links) {
    const group = byDeal.get(link.opportunityId) ?? [];
    group.push(link); byDeal.set(link.opportunityId, group);
  }
  const pending = rows.filter(row => byAccount.has(row.id));
  const workers = Array.from({ length: Math.min(6, pending.length) }, async function next(): Promise<void> {
    const row = pending.shift();
    if (!row) return;
    await readAccount(ctx, row, byAccount.get(row.id)!, byDeal, contacts);
    return next();
  });
  await Promise.all(workers);
}

async function readAccount(ctx: FocusContext, row: FocusRow, deals: Deal[], links: Map<string, Links>, cache?: ReadonlyMap<string, ContactRecord[]>) {
  try {
    const [contacts, relations] = await Promise.all([
      cache ? cachedContacts(cache, row.id) : ctx.accounts.listContacts(ctx.workspaceId, row.id),
      ctx.accounts.listRelations(ctx.workspaceId, row.id),
    ]);
    const chains = deals.map(deal => {
      const people = chainForOpportunity(contacts, links.get(deal.id) ?? []);
      return { people, coverage: analyzeChain(people, relations) };
    });
    row.coverage = summarize(chains);
  } catch {
    row.coverage = { state: "unavailable" };
  }
}

function summarize(
  chains: { people: ReturnType<typeof chainForOpportunity>; coverage: ReturnType<typeof analyzeChain> }[],
): FocusCoverage {
  const people = new Set<string>();
  let established = 0, covered = 0, complete = 0, unreachable = 0;
  for (const chain of chains) {
    const active = chain.people.filter(person => person.status === "active" && person.decisionRole !== "unknown");
    if (active.length) established++;
    for (const person of active) if (REQUIRED_ROLES.includes(person.decisionRole)) people.add(person.id);
    covered += REQUIRED_ROLES.length - chain.coverage.missing.length;
    if (active.length && chain.coverage.economicBuyerUnreachable) unreachable++;
    if (!chain.coverage.missing.length && !chain.coverage.economicBuyerUnreachable) complete++;
  }
  return { state: "ready", keyPeople: people.size, coveredRoles: covered, requiredRoles: chains.length * REQUIRED_ROLES.length,
    chains: established, totalChains: chains.length, completeChains: complete, unreachableChains: unreachable };
}


function cachedContacts(cache: ReadonlyMap<string, ContactRecord[]>, id: string) {
  const rows = cache.get(id);
  if (!rows) throw new Error("contacts_unavailable");
  return rows;
}
