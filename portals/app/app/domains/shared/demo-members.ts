import type { AuthzStore } from "../../authz/store";
import type { RoleCode } from "../../authz/catalog";
import type { PlanningStore } from "../planning/store";
import { DEMO_MEMBER_NAMES, DEMO_SUCCESSOR_NAMES, DEMO_WUXIA_MEMBER_NAMES } from "./demo-fixtures";

// The demo's people, as members.
//
// WHY THIS EXISTS. Five subs already appear all over the demo - they own deals,
// review win/loss, decide proposals, manage projects - and NONE of them was a
// member. /admin/members rendered an empty state on a workspace whose data is
// full of named people, so the one screen that explains what a role does could
// not be looked at. Same gap as the demo having no settled quarter: the surface
// a reviewer most needs is the one the fixture could not reach.
//
// EVERY SUB THE DEMO REFERENCES IS HERE, and demo-members.test.ts holds that
// property against the seeded stores rather than against a list. A name that
// appears as an owner and not in the roster is a person the product cannot
// explain: the member row is the only thing mapping `usr_demo_rep` to a human,
// and every signature in the audit trail reads through it.
//
// HERE RATHER THAN IN authz/, and the layering decided it: the names are
// user-facing text, TD-002 keeps that in demo-fixtures.ts, and authz sits UNDER
// the domains and must never import one. domains -> authz is the allowed
// direction, so the seeder lives on this side and reaches down for the port.

interface DemoMember {
  readonly sub: string;
  readonly displayName: string;
  readonly roles: readonly RoleCode[];
  readonly active: boolean;
}

/**
 * THE DEPARTMENT ROSTER (owner, 2026-09-13: 按照金庸武侠小说正面人物，构建
 * 100+数据，作为演示数据 - 本组织的成员/团队，并分配关联到组织、大区、角色;
 * 100+用户，并分配到各级部门). `DEMO_WUXIA_MEMBER_NAMES` (demo-fixtures.ts)
 * is a flat 116-name list; this file turns it into people WITH A SEAT - a
 * unit and a role - by POSITION, so the flat list stays free of any org
 * opinion and every seating rule lives in exactly one place.
 *
 * NINE LEADERS, THEN THE REST ON THE FLOOR. The first nine names take
 * headquarters (two seats: 高管/财务) and one 大区 each of the seven the
 * default template (`national_medium`, org.ts) ships - a regional director
 * per 大区, the shape a national company actually has. Everyone after that
 * is rank-and-file, round-robined across the seven teams (`*_team1`) so no
 * team is empty and none is dramatically overloaded, with a small role cycle
 * (mostly 销售代表, one 销售经理 and two specialist roles per lap) so a team
 * is not nine identical rows.
 */
const WUXIA_LEADERSHIP: readonly { readonly unit: string; readonly role: RoleCode }[] = [
  { unit: "headquarters", role: "executive" },
  { unit: "headquarters", role: "finance" },
  { unit: "north", role: "regional_director" },
  { unit: "northeast", role: "regional_director" },
  { unit: "east", role: "regional_director" },
  { unit: "central", role: "regional_director" },
  { unit: "south", role: "regional_director" },
  { unit: "southwest", role: "regional_director" },
  { unit: "northwest", role: "regional_director" },
];

/** The one team unit under each of the seven 大区 (org.ts's `national_medium`). */
const WUXIA_TEAM_UNITS: readonly string[] = [
  "north_team1", "northeast_team1", "east_team1", "central_team1",
  "south_team1", "southwest_team1", "northwest_team1",
];

/** Cycled across the rank-and-file - mostly 销售代表, one 销售经理 and two
 *  specialist roles per lap of seven. */
const WUXIA_TEAM_ROLE_CYCLE: readonly RoleCode[] = [
  "sales_rep", "sales_rep", "sales_manager", "presales", "sales_rep", "sdr", "sales_rep",
];

const wuxiaSub = (i: number): string => `usr_demo_m${String(i + 1).padStart(3, "0")}`;

interface WuxiaSeat {
  readonly sub: string;
  readonly name: string;
  readonly unit: string;
  readonly role: RoleCode;
}

const WUXIA_SEATS: readonly WuxiaSeat[] = DEMO_WUXIA_MEMBER_NAMES.map((name, i) => {
  const seat = i < WUXIA_LEADERSHIP.length
    ? WUXIA_LEADERSHIP[i]!
    : (() => {
        const j = i - WUXIA_LEADERSHIP.length;
        return { unit: WUXIA_TEAM_UNITS[j % WUXIA_TEAM_UNITS.length]!, role: WUXIA_TEAM_ROLE_CYCLE[j % WUXIA_TEAM_ROLE_CYCLE.length]! };
      })();
  return { sub: wuxiaSub(i), name, unit: seat.unit, role: seat.role };
});

const WUXIA_MEMBERS: readonly DemoMember[] = WUXIA_SEATS.map((s) => ({
  sub: s.sub,
  displayName: s.name,
  roles: [s.role],
  active: true,
}));

/** name -> sub, for handing a retiring seed identity's data to a specific
 *  already-seated cast member (below) rather than inventing a standalone
 *  identity for it. */
const WUXIA_SUB_BY_NAME: ReadonlyMap<string, string> = new Map(WUXIA_SEATS.map((s) => [s.name, s.sub]));

/**
 * WHO NOW OWNS WHAT THE RETIRED FIVE USED TO (owner, 2026-09-13: 把原来的
 * 几个用户全部归入已停用 - 把他们拥有的数据改到金庸人物名下). See
 * DEMO_SUCCESSOR_NAMES (demo-fixtures.ts) for who and why; demo-seed.ts reads
 * these subs rather than the retired ones for every opportunity, account,
 * interaction, delivery project, win-loss review and proposal that used to
 * read `usr_demo_cro`/`usr_demo_leader`/`usr_demo_rep`/`usr_demo_rep2`/
 * `usr_demo_pm`.
 */
export const DEMO_SUCCESSOR_SUBS = {
  cro: WUXIA_SUB_BY_NAME.get(DEMO_SUCCESSOR_NAMES.cro)!,
  leader: WUXIA_SUB_BY_NAME.get(DEMO_SUCCESSOR_NAMES.leader)!,
  rep: WUXIA_SUB_BY_NAME.get(DEMO_SUCCESSOR_NAMES.rep)!,
  rep2: WUXIA_SUB_BY_NAME.get(DEMO_SUCCESSOR_NAMES.rep2)!,
  pm: WUXIA_SUB_BY_NAME.get(DEMO_SUCCESSOR_NAMES.pm)!,
} as const;

export const DEMO_MEMBERS: readonly DemoMember[] = [
  // RETIRED (owner, 2026-09-13: 把原来的几个用户全部归入已停用). NO ROLES,
  // same reason `former` below has none - deactivation takes a member away
  // rather than remembering them, and an inactive member still holding a
  // role or owning live data is exactly the state demo-members.test.ts
  // checks against. DEMO_SUCCESSOR_SUBS above is who owns their old data now.
  { sub: "usr_demo_cro", displayName: DEMO_MEMBER_NAMES.cro, roles: [], active: false },
  { sub: "usr_demo_leader", displayName: DEMO_MEMBER_NAMES.leader, roles: [], active: false },
  { sub: "usr_demo_rep", displayName: DEMO_MEMBER_NAMES.rep, roles: [], active: false },
  { sub: "usr_demo_rep2", displayName: DEMO_MEMBER_NAMES.rep2, roles: [], active: false },
  { sub: "usr_demo_pm", displayName: DEMO_MEMBER_NAMES.pm, roles: [], active: false },
  // Someone who has left. NO ROLES, because deactivation takes them away rather
  // than remembering them - see deactivateMember. Owns nothing live: a departed
  // member who still owns deals is the handover case, and handover does not
  // exist yet, so the demo would be posing a problem it has no control to fix.
  { sub: "usr_demo_former", displayName: DEMO_MEMBER_NAMES.former, roles: [], active: false },
  ...WUXIA_MEMBERS,
];

/**
 * Put the demo's people in the roster. Idempotent - `seeMember` upserts and
 * `grantRole` is a no-op for a role already held.
 */
export async function seedDemoMembers(workspaceId: string, store: AuthzStore): Promise<void> {
  for (const m of DEMO_MEMBERS) {
    await store.seeMember({ workspaceId, sub: m.sub, displayName: m.displayName });
    for (const role of m.roles) await store.grantRole(workspaceId, m.sub, role);
    if (!m.active) await store.setMemberStatus(workspaceId, m.sub, "inactive");
  }
}

/**
 * WHERE THE DEMO'S PEOPLE SIT in the default organisation (incr/0051's
 * national_medium template, by unit code) - so 组织视图 shows an organisation
 * with people in it rather than fifteen empty units, and so the unit scope
 * has something to frame. The retired five (and `former`) are placed
 * nowhere, same as any departed member: 未归属 is a state the view shows,
 * and their old seats now belong to whoever DEMO_SUCCESSOR_SUBS names.
 *
 * 黄蓉 (`leader`'s successor) keeps the ONE deliberately-several-units
 * placement the retired `usr_demo_leader` had (0053: 一人在多个组织内) -
 * headquarters plus 华东 - rather than that scenario quietly losing its only
 * demo case along with the sub that used to carry it.
 */
const DEMO_PLACEMENTS: readonly { readonly sub: string; readonly units: readonly string[] }[] = WUXIA_SEATS.map(
  (s) => ({ sub: s.sub, units: s.sub === DEMO_SUCCESSOR_SUBS.leader ? [s.unit, "east"] : [s.unit] }),
);

/**
 * Place the demo's people. Idempotent - the set is replaced whole. Seeds the
 * default tree first if the workspace has none yet (the service does the
 * same on first read); a code the tree does not carry is skipped, since a
 * reset to another template is a thing the demo lets you do.
 */
export async function seedDemoPlacements(workspaceId: string, planning: PlanningStore): Promise<void> {
  await planning.seedOrgDefaults(workspaceId);
  const byCode = new Map((await planning.listOrgUnits(workspaceId)).map((u) => [u.unitCode, u.id]));
  for (const p of DEMO_PLACEMENTS) {
    const ids = p.units.map((c) => byCode.get(c)).filter((x): x is string => Boolean(x));
    if (ids.length > 0) await planning.setMemberUnits(workspaceId, p.sub, ids);
  }
}
