import type { AuthzStore } from "../../authz/store";
import type { RoleCode } from "../../authz/catalog";
import type { PlanningStore } from "../planning/store";
import { DEMO_MEMBER_NAMES, DEMO_WUXIA_MEMBER_NAMES } from "./demo-fixtures";

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

export const DEMO_MEMBERS: readonly DemoMember[] = [
  // Owns the strategy plans and the targets.
  { sub: "usr_demo_cro", displayName: DEMO_MEMBER_NAMES.cro, roles: ["sales_leader"], active: true },
  // Signs the win/loss reviews and adjudicates the copilot's proposals.
  {
    sub: "usr_demo_leader",
    displayName: DEMO_MEMBER_NAMES.leader,
    roles: ["sales_leader"],
    active: true,
  },
  { sub: "usr_demo_rep", displayName: DEMO_MEMBER_NAMES.rep, roles: ["sales_rep"], active: true },
  { sub: "usr_demo_rep2", displayName: DEMO_MEMBER_NAMES.rep2, roles: ["sales_rep"], active: true },
  // Runs the delivery projects.
  {
    sub: "usr_demo_pm",
    displayName: DEMO_MEMBER_NAMES.pm,
    roles: ["delivery_manager"],
    active: true,
  },
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
 * has something to frame. Two placements are deliberately several units
 * (0053: 一人在多个组织内): the leader runs 华东 and also sits at 总部.
 */
const DEMO_PLACEMENTS: readonly { readonly sub: string; readonly units: readonly string[] }[] = [
  { sub: "usr_demo_cro", units: ["headquarters"] },
  { sub: "usr_demo_leader", units: ["headquarters", "east"] },
  { sub: "usr_demo_rep", units: ["east_team1"] },
  { sub: "usr_demo_rep2", units: ["east_team1", "south_team1"] },
  { sub: "usr_demo_pm", units: ["headquarters"] },
  // The departed member is placed nowhere: 未归属 is a state the view shows.
  ...WUXIA_SEATS.map((s) => ({ sub: s.sub, units: [s.unit] })),
];

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
