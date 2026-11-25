import { createHash } from "node:crypto";
import { can } from "../../authz/decide";
import { getAuthzStore } from "../../authz/store";
import { scopeAccountStore, scopePipelineStore } from "../../authz/scoped-stores";
import { resolveDataScope } from "../../(app)/lib/resolve-scope";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { readProvisionedOrganizations } from "../../provisioning/lib/read";
import { readProductRoster } from "../../platform/product-roster";
import { getAccountStore, getPipelineStore } from "../shared/registry";
import { dailyJudgementBaseline, hasDailyJudgementBaseline } from "./daily-baseline";
import { topicFeed } from "./topic-feed";

const services = {
  entitlement: (workspaceId: string) => getEntitlementResolver().resolve(workspaceId),
  roster: readProductRoster,
  organizations: readProvisionedOrganizations,
  authz: getAuthzStore,
  scope: resolveDataScope,
  account: getAccountStore,
  pipeline: getPipelineStore,
  exists: hasDailyJudgementBaseline,
  baseline: dailyJudgementBaseline,
  feed: topicFeed,
};
export type DailyJobServices = typeof services;

/** Background local rule evaluation with current member permissions. It never
 * mints/retains user OBO tokens, reads private chats or invokes a model. */
export async function runDailyJudgements(
  workspaces: readonly string[],
  now = new Date(),
  deps: DailyJobServices = services,
) {
  const ledger = { generated: 0, skipped: 0, failed: 0 };
  if (workspaces.length === 0) return ledger;
  // Complete the authoritative directory first. Never borrow an organization
  // from another workspace or use partially read provisioning data.
  const organizations = await deps.organizations();
  for (const workspaceId of workspaces) {
    const orgId = organizations?.get(workspaceId);
    if (!orgId) { ledger.skipped++; continue; }
    try {
      const authz = deps.authz();
      const [entitlement, roster, members] = await Promise.all([
        deps.entitlement(workspaceId), deps.roster(workspaceId, orgId), authz.listMembers(workspaceId),
      ]);
      if (roster === null) { ledger.skipped++; continue; }
      const authorized = members.filter(m => m.status === "active" && roster.some(r => r.subject === m.sub));
      for (const member of authorized) {
        try {
          const permissions = await authz.permissionsOf(workspaceId, member.sub);
          const holder = { permissions: new Set(permissions) };
          if (!can(holder, entitlement, "copilot.ask", "data").allowed ||
              !can(holder, entitlement, "account.view", "data").allowed) {
            ledger.skipped++; continue;
          }
          const scope = await deps.scope(workspaceId, member.sub, authz);
          const accessVersion = createHash("sha256").update(JSON.stringify({
            permissions: [...permissions].sort((a, b) => a.localeCompare(b)),
            scope, tier: entitlement.tier, bundled: entitlement.bundled,
          })).digest("hex");
          const ctx = {
            workspaceId, sub: member.sub, holder, entitlement,
            allowWorkspaceMetrics: scope.kind === "workspace",
            stores: {
              account: () => scopeAccountStore(deps.account(), scope),
              pipeline: () => scopePipelineStore(deps.pipeline(), scope, member.sub),
            },
          };
          // Both choices retain the original scoped stores and service rules.
          for (const selected of ["mine", "all"] as const) {
            if (await deps.exists({ ...ctx, accessVersion }, selected, now)) {
              ledger.skipped++; continue;
            }
            const feed = await deps.feed(ctx, { scope: selected, now });
            if (feed.ok) {
              await deps.baseline({ ...ctx, accessVersion }, feed.value, now);
              ledger.generated++;
            } else {
              ledger.failed++;
            }
          }
        } catch { ledger.failed++; }
      }
    } catch { ledger.failed++; }
  }
  return ledger;
}
