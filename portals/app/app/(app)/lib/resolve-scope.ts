import { WHOLE_WORKSPACE, expandTerritories, type DataScope } from "../../authz/scope";
import { coveringTerritories } from "../../domains/signal/lib/routing";
import type { AuthzStore } from "../../authz/store";
import {
  getAccountStore,
  getPipelineStore,
  getPlanningStore,
  getSignalStore,
} from "../../domains/shared/registry";

// Turning the administrator's setting into the scope one request carries.
//
// HERE RATHER THAN IN authz, and the layering decided it: resolving `own` means
// asking which customers this member's work sits on, which spans accounts,
// opportunities and leads. `authz` sits UNDER the domains and must not read one,
// so the walk happens on this side, where reading several domains is already
// ordinary - resolveAppSession does it for the entitlement and the demo seed.
//
// ONCE PER REQUEST, not per query. The alternative - joining the reachability
// into every read - would put a cross-domain join inside a store, which is the
// one thing the partition rule forbids: a store may not reach into another's
// tables.
//
// THE UNSCOPED PATH COSTS NOTHING. `workspace` returns before any read, which
// is every member until an administrator says otherwise, so the default
// configuration adds no queries at all.

export async function resolveDataScope(
  workspaceId: string,
  sub: string,
  authz: AuthzStore,
): Promise<DataScope> {
  const setting = await authz.getScope(workspaceId, sub);
  if (setting.kind === "workspace") return WHOLE_WORKSPACE;

  if (setting.kind === "territory") {
    // EXPANDED DOWN THE HIERARCHY. Assigned a parent, you cover its children -
    // otherwise territory.parent_id is decorative and the configuration is
    // wrong the day somebody adds a sub-region.
    const territories = await getPlanningStore().listTerritories(workspaceId);
    const parentOf = new Map<string, string | null>(
      territories.map((t) => [t.id, t.parentId ?? null]),
    );
    const territoryIds = expandTerritories(setting.territoryIds, parentOf);

    // AND THE CUSTOMERS ON THAT GROUND. `account` and `lead` carry no territory
    // column, so without this the scope showed deals and hid every customer and
    // every lead - the shape this shipped in and the reason the fix exists.
    //
    // The region-to-territory match is `coveringTerritories`, the same rule
    // lead routing uses. Re-deriving it here would give the product two answers
    // to "which territory covers this customer", and routing would send a lead
    // to somebody who cannot see it.
    const mine = new Set(territoryIds);
    const covered = new Set(
      territories.filter((t) => mine.has(t.id)).flatMap((t) => t.regions ?? []),
    );
    const accounts = await getAccountStore().listAccounts(workspaceId);
    const accountIds = accounts
      .filter((a) => a.region != null && covered.has(a.region))
      .map((a) => a.id);

    // THE FALLBACK. Whoever owns a territory on this ground - one person per
    // territory, per the column - carries their unfiled work onto it.
    const ownerSubs = territories
      .filter((t) => mine.has(t.id) && t.ownerSub)
      .map((t) => t.ownerSub as string);

    // 未分区: customers no territory covers AT ALL, computed against every
    // ACTIVE territory rather than against this member's. The question is
    // whether the row is filed anywhere, not whether it is filed here - and
    // `coveringTerritories` is the same rule routing uses to answer it, so the
    // two cannot disagree about which customers are unplaced.
    const unplacedAccountIds = accounts
      .filter((a) => a.region == null || coveringTerritories(a.region, territories).length === 0)
      .map((a) => a.id);

    return { kind: "territory", territoryIds, accountIds, ownerSubs, unplacedAccountIds };
  }

  // `own` - what I hold, plus the customers my work sits on.
  //
  // READ THROUGH THE UNSCOPED STORES DELIBERATELY. This computation is what
  // DEFINES the scope; running it against an already-scoped store would ask the
  // answer to depend on itself, and the fixed point is "sees nothing".
  const [deals, leads] = await Promise.all([
    getPipelineStore().listOpportunities(workspaceId, { ownerSub: sub, includeClosed: true }),
    getSignalStore().listLeads(workspaceId, { ownerSub: sub }),
  ]);

  const accountIds = new Set<string>();
  for (const d of deals) if (d.accountId) accountIds.add(d.accountId);
  for (const l of leads) if (l.accountId) accountIds.add(l.accountId);

  // Accounts held outright are matched by the ownership path rather than listed
  // here - canSeeRow checks owner_sub first, so adding them would be a second
  // way to say the same thing and a second thing to keep in step.

  return { kind: "own", sub, accountIds: [...accountIds] };
}
