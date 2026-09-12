import { cookies } from "next/headers";
import type { Entitlement } from "../../entitlement/types";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import type { AuthUser } from "../../auth/lib/claims";
import { resolveAuthzContext, type AuthzContext } from "../../authz/context";
import {
  ensureDemoData,
  getAccountStore,
  getPipelineStore,
  getPlanningStore,
  getSignalStore,
} from "../../domains/shared/registry";
import { applyStartupPreset } from "./startup-preset";
import { getAuthzStore } from "../../authz/store";
import type { DataScope } from "../../authz/scope";
import {
  scopeAccountStore,
  scopePipelineStore,
  scopeSignalStore,
} from "../../authz/scoped-stores";
import type { AccountStore } from "../../domains/account/store";
import type { PipelineStore } from "../../domains/pipeline/store";
import type { SignalStore } from "../../domains/signal/store";
import { resolveDataScope } from "./resolve-scope";
import { resolveDevSession } from "./dev-session";
import { DEFAULT_DIVISION_CARVE_KEY } from "../../domains/account/service";

// Per-request resolution of everything a product surface needs, in the order
// design_yucer_100 section 5 mandates:
//
//   session (C1) -> entitlement (C2) -> permission (local_authz)
//
// SERVER-ONLY. Reaches cookies, Redis and the database.
//
// Every failure returns null rather than throwing or substituting a default. A
// page with no session must render a sign-in prompt, and a page whose token
// carries no active workspace must not guess one - workspace_id is the
// authoritative isolation key and inventing it is the worst available bug.

export interface AppSession {
  user: AuthUser;
  workspaceId: string;
  entitlement: Entitlement;
  authz: AuthzContext;
  /**
   * Which rows this member may see, resolved once for the request.
   *
   * `workspace` for everyone until an administrator narrows them, and at that
   * value nothing is wrapped and nothing costs anything.
   */
  scope: DataScope;
  /**
   * The three owner-bearing stores, ALREADY SCOPED.
   *
   * THE POINT OF PUTTING THEM HERE is that a surface cannot get an unscoped one
   * by accident. `getPipelineStore()` still exists - the resolver itself needs
   * it, and so does every domain-internal caller - but a page reaching for it
   * would be reaching past the scope, so scoped-acquisition.test.ts refuses the
   * raw getters anywhere under (app). The stores a page can reach are the ones
   * on the session.
   *
   * Functions rather than values so the wrapping is paid only by a surface that
   * actually reads that domain.
   */
  stores: {
    pipeline(): PipelineStore;
    account(): AccountStore;
    signal(): SignalStore;
  };
}

/**
 * 新租户预置：总部 + 5 分区 (owner, 2026-09-12: 任何新开通业务的租户有这个
 * 演示数据). REAL WORKSPACES ONLY - the identical orchestration
 * `applyStartupTemplateAction` already runs from a manual "应用模版" button
 * (`admin/org/actions.ts`), just triggered here automatically instead, the
 * first time a real person opens the app in a workspace that has never had
 * any org structure at all.
 *
 * NO MEMBER, ACCOUNT OR OPPORTUNITY ROWS - deliberately. `member` is a real
 * login identity (a `sub`), and `tenant.provisioned` carries none (no person
 * event exists on that webhook at all); seeding people nobody can log in as
 * would be worse than seeding nothing. `Opportunity.ownerSub` is NOT NULL
 * (incr/0034) so opportunities are blocked by the same absence. Both wait on
 * a "placeholder member" feature that does not exist yet.
 *
 * THE GUARD IS THE SAME EMPTY-CHECK `ensureOrgSeeded`/`seedOrgDefaults`
 * (`domains/planning/service.ts`) ALREADY USES for its own default-template
 * lazy seed - `org_unit_kind` count for the workspace. `resolveAppSession`
 * is the one function every real page calls before any page-specific domain
 * read, so this always resolves before a page's own `ensureOrgSeeded` could
 * possibly fire in the same request and seed the STATIC 7-region default
 * instead of this 5-region one.
 *
 * PERMISSION-GATED LIKE THE MANUAL BUTTON IS, ON PURPOSE - `applyOrgTemplate`/
 * `importDivisionTemplate`/`upsertTerritory`/`setUnitDivisions` all check
 * `admin.org.upsert`/`planning.territory.upsert` internally, same as a real
 * admin clicking "应用模版" would need. The common case (the workspace OWNER
 * is virtually always the first real login) already holds every permission
 * (`OWNER_BOOTSTRAP_ROLE = sales_leader`, 25/25 grants) the moment
 * `resolveAuthzContext` runs above, a few lines up. The rare case - someone
 * else logs in first - fails the gate silently and the empty-check simply
 * tries again on the next real login, which is the same self-healing shape
 * every other lazy seed in this file already has; forking an ungated path
 * just for this one caller was not worth carrying two versions of the same
 * orchestration.
 */
async function ensureStartupPreset(workspaceId: string, sub: string, authz: AuthzContext, entitlement: Entitlement) {
  const planningStore = getPlanningStore();
  if ((await planningStore.listOrgKinds(workspaceId)).length > 0) return;
  const planningCtx = { workspaceId, sub, holder: authz, entitlement, store: planningStore };
  const accountCtx = { workspaceId, sub, holder: authz, entitlement, store: getAccountStore() };
  await applyStartupPreset(planningCtx, accountCtx, {
    orgKey: "national_medium",
    divisionKey: DEFAULT_DIVISION_CARVE_KEY,
    autoAssociate: true,
  });
}

/** Attach the scoped stores to a resolved session. */
function withStores(
  base: Omit<AppSession, "stores">,
): AppSession {
  return {
    ...base,
    stores: {
      pipeline: () => scopePipelineStore(getPipelineStore(), base.scope),
      account: () => scopeAccountStore(getAccountStore(), base.scope),
      signal: () => scopeSignalStore(getSignalStore(), base.scope),
    },
  };
}

export async function resolveAppSession(): Promise<AppSession | null> {
  // Local review only, and refused three independent ways - see dev-session.ts.
  // Placed FIRST so it is obvious that it short-circuits the real chain, rather
  // than hidden as a fallback where a reader would have to reason about when it
  // fires. It still carries a real role and a real entitlement, so both gates
  // below it evaluate normally.
  const dev = await resolveDevSession();
  if (dev) {
    ensureDemoData(dev.workspaceId);
    // The demo seed must exist before the scope is resolved: `own` reads the
    // member's book, and an empty store would resolve to seeing nothing on the
    // first render and everything on the second.
    const scope = await resolveDataScope(dev.workspaceId, dev.user.sub, getAuthzStore());
    return withStores({ ...dev, scope });
  }

  const cfg = getOidcConfig();
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  if (!rpsid) return null;

  const user = await getAuthUser(cfg, rpsid);
  if (!user) return null;

  // No active workspace means no isolation key, which means no product surface.
  const workspaceId = user.activeWorkspace;
  if (!workspaceId) return null;

  // Entitlement and membership resolve independently; both are needed before a
  // single gate can be evaluated, so they run together rather than in series.
  const [entitlement, authz] = await Promise.all([
    getEntitlementResolver().resolve(workspaceId),
    resolveAuthzContext(user),
  ]);
  if (!authz) return null;

  // Offline demo path only. No-op unless YUCER_DEMO_DATA is explicitly "on" AND
  // there is no DATABASE_URL; see ensureDemoData for why it is guarded twice.
  ensureDemoData(workspaceId);

  // REAL WORKSPACES ONLY - never the `dev` branch above. `demo-members.ts`'s
  // DEMO_PLACEMENTS hardcodes bare unit codes ("east") matching the STATIC
  // default template; this 5-region preset generates prefixed ones
  // ("headquarters_east", `planning/lib/org.ts`'s `regionUnits`) and
  // `applyOrgTemplate` is destructive (wipes existing units first) - running
  // it against the dev-session workspace would rebuild the demo org tree
  // with codes `seedDemoPlacements()` can no longer find. See
  // `ensureStartupPreset`'s own comment for the rest of the reasoning.
  await ensureStartupPreset(workspaceId, user.sub, authz, entitlement);

  const scope = await resolveDataScope(workspaceId, user.sub, getAuthzStore());
  return withStores({ user, workspaceId, entitlement, authz, scope });
}

/**
 * The tenant id for the agent planes.
 *
 * Atlas hard-fails a call with no tenant, and both planes meter against the
 * tenant x workspace pair. The platform issues it as `active_org` on the token.
 */
export function tenantIdOf(session: AppSession): string | null {
  return session.user.activeOrg;
}
