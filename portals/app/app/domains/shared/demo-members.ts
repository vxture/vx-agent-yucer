import type { AuthzStore } from "../../authz/store";
import type { RoleCode } from "../../authz/catalog";
import type { PlanningStore } from "../planning/store";
import { DEMO_MEMBER_NAMES } from "./demo-fixtures";

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
  { sub: "usr_demo_cro", units: ["hq"] },
  { sub: "usr_demo_leader", units: ["hq", "east"] },
  { sub: "usr_demo_rep", units: ["east_team1"] },
  { sub: "usr_demo_rep2", units: ["east_team1", "south_team1"] },
  { sub: "usr_demo_pm", units: ["hq"] },
  // The departed member is placed nowhere: 未归属 is a state the view shows.
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
