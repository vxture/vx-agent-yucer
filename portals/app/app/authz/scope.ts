// Which rows a member may see.
//
// The owner's rulings of 2026-09-01: data scope is the batch after roles; the
// decision belongs to the workspace ADMINISTRATOR rather than to the role
// catalogue ("不一定是总经理"); and it narrows BOTH lists and reads by id -
// which makes this confidentiality, not organisation.
//
// A SECOND ISOLATION KEY, and that is the design in one line. `workspace_id` is
// not a business rule evaluated in a service - it is a parameter every store
// call carries, so no verb can forget it. Scope is the same kind of statement
// about who a row is for, so it travels the same way. Enforcing it per verb
// would mean every list, every read by id and every future verb remembering -
// and a forgotten one is a silent confidentiality hole, which is the worst
// failure this product could ship, because people would believe the setting.
//
// THIS FILE IS THE RULE ONLY. It computes what a member may see; it enforces
// nothing. Enforcement is the next batch, and until it lands there is NO admin
// surface for this - deliberately. A screen that says "sees only their own"
// while the person still sees everything is worse than no screen: a
// confidentiality feature that leaks is worse than none, because it is trusted.

import { fail, ok, violation, type RuleResult } from "../domains/shared/result";

export const DATA_SCOPES = ["workspace", "territory", "own"] as const;
export type DataScopeKind = (typeof DATA_SCOPES)[number];

export function isDataScope(v: string): v is DataScopeKind {
  return (DATA_SCOPES as readonly string[]).includes(v);
}

/**
 * The resolved scope a request carries.
 *
 * `workspace` carries nothing else because it narrows nothing. The other two
 * carry what they narrow BY, resolved once - a store must never have to ask a
 * second question to apply it.
 */
export type DataScope =
  | { readonly kind: "workspace" }
  | {
      readonly kind: "territory";
      readonly territoryIds: readonly string[];
      /**
       * Customers whose ground these territories cover.
       *
       * THE PARENT PATH, and without it the territory scope was broken rather
       * than narrow: `account` and `lead` carry NO territory column at all - a
       * lead reaches one only through `account_id -> account.region ->
       * territory.regions`, the mapping incr/0017 built for routing. Checking
       * only the row's own territory showed a member their deals, the public
       * pool, and nothing else.
       */
      readonly accountIds: readonly string[];
      /**
       * People who own a territory on this ground.
       *
       * THE FALLBACK, tried before anything is called unplaced: a deal on a
       * customer with no region, held by the person who runs East China, is
       * East China's. Placing it by its owner RESOLVES the case rather than
       * widening it, which is why this comes first.
       *
       * `territory.owner_sub` is one person per territory, so this reaches
       * records held by territory owners and not by every rep - the schema
       * carries no other statement of which territory a person works.
       */
      readonly ownerSubs: readonly string[];
      /**
       * Customers that land in NO territory at all - 未分区.
       *
       * The owner's ruling of 2026-09-01. What survives the two paths and the
       * fallback is work that, left invisible, NOBODY can see: not its region's
       * manager, because it has no region. So every territory member sees it.
       *
       * A DELIBERATE LOOSENING, worth naming as one: an owned row becomes
       * visible outside its owner's line because its account is missing a
       * region - a filing gap widening access. The ruling accepts that, because
       * the alternative is work that silently disappears.
       *
       * NOT the public pool. 公海 is a row with no OWNER, visible at every
       * scope and claimable by anyone. This is a row somebody holds that nobody
       * has filed.
       */
      readonly unplacedAccountIds: readonly string[];
    }
  | {
      readonly kind: "own";
      readonly sub: string;
      /**
       * Accounts reachable through work this member owns.
       *
       * THE CASE THAT MAKES THIS NECESSARY: a rep scoped to `own` owns a deal
       * on an account somebody else owns. Their own deal's page opens that
       * account. If `own` meant strictly "accounts whose owner_sub is me", the
       * page for their own deal would fail to load the customer it is about -
       * so the scope would be enforcing confidentiality against the person it
       * was supposed to be describing.
       *
       * So `own` means: what I own, PLUS the customers my work sits on - the
       * honest reading of "my book".
       *
       * Resolved once per request rather than joined per query, because the
       * answer spans domains and no store may reach into another's tables.
       */
      readonly accountIds: readonly string[];
    };

export const WHOLE_WORKSPACE: DataScope = { kind: "workspace" };

/**
 * What the member's configuration says, before it meets any data.
 *
 * Kept separate from `DataScope` on purpose: this is what the administrator
 * SET, and the resolved scope is what that means for one request. Conflating
 * them would make the resolution untestable without a store.
 */
export interface ScopeSetting {
  readonly kind: DataScopeKind;
  readonly territoryIds: readonly string[];
}

export const UNSCOPED: ScopeSetting = { kind: "workspace", territoryIds: [] };

/**
 * Is this configuration coherent?
 *
 * A `territory` scope with no territories is the one combination worth
 * refusing at the point of saving. It is not a security problem - it resolves
 * to seeing nothing, which is the safe direction - it is a HALF-FINISHED
 * SETTING, and the administrator who saved it will believe they have granted
 * access to a region. Refusing is how they find out now rather than when
 * somebody reports an empty screen.
 *
 * The other direction is allowed without comment: `workspace` and `own` carry
 * no territories, and a stale list left behind by switching away from
 * `territory` is ignored rather than an error.
 */
export function validateScopeSetting(s: ScopeSetting): RuleResult<ScopeSetting> {
  if (!isDataScope(s.kind)) {
    return fail(violation("unknown_scope", `${String(s.kind)} is not a data scope`, "kind"));
  }
  if (s.kind === "territory" && s.territoryIds.length === 0) {
    return fail(
      violation(
        "territory_required",
        "a territory scope with no territories shows nothing; assign at least one",
        "territoryIds",
      ),
    );
  }
  return ok(s);
}

/**
 * Every territory a member may see, following `parent_id` downward.
 *
 * A DIRECTOR ASSIGNED A PARENT SEES ITS CHILDREN, which is the whole reason
 * territory has had `parent_id` since the baseline. Assigning every leaf by
 * hand would make the hierarchy decorative and the configuration wrong the day
 * somebody adds a sub-region.
 *
 * Cycle-safe by construction - `seen` is checked before descending - because
 * `parent_id` is a plain self-reference with no constraint preventing a loop,
 * and a data correction that made one would otherwise hang a request rather
 * than render a page.
 */
export function expandTerritories(
  assigned: readonly string[],
  parentOf: ReadonlyMap<string, string | null>,
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const [id, parent] of parentOf) {
    if (!parent) continue;
    const list = childrenOf.get(parent);
    if (list) list.push(id);
    else childrenOf.set(parent, [id]);
  }

  const seen = new Set<string>();
  const queue = [...assigned];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of childrenOf.get(id) ?? []) queue.push(child);
  }
  return [...seen];
}
