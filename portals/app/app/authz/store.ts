// Persistence port for the permission gate (local_authz). Same port/adapter
// shape the contract surface already uses (provisioning/lib/store.ts,
// usage/lib/store.ts): an in-memory implementation for the offline path and
// tests, a Prisma implementation when DATABASE_URL is set.
//
// Membership is LAZY (docs/20-specs/50-role-permission-catalog.md, "runtime
// discipline"): a row appears on the first sighting of (workspace_id, sub) at
// login. local_authz.member is not a real-time mirror of the platform's
// workspace membership, and nothing here tries to make it one.

import { prismaEnabled } from "../lib/db";
import { PrismaAuthzStore } from "./prisma-store";
import { DEFAULT_ROLE_LINES, DEFAULT_ROLE_RANKS, PERM_CODES, presetRoles, type PermCode, type PresetRole } from "./catalog";
import { isDataScope, type DataScopeKind, type ScopeSetting } from "./scope";

export interface MemberSighting {
  workspaceId: string;
  sub: string;
  /** Platform display cache; may be stale, never authoritative. */
  displayName?: string | null;
  avatarHash?: string | null;
}

export interface MemberRecord {
  memberId: string;
  workspaceId: string;
  sub: string;
  displayName: string | null;
  status: string;
  /** Codes of the WORKSPACE'S roles (incr/0046) - a preset copy or the
   *  tenant's own; a string because the list is theirs, not the build's. */
  roles: string[];
  /** Which rows they may see, as configured. incr/0022. */
  scope: DataScopeKind;
  /** Assigned territories, unexpanded. Empty unless `scope` is "territory". */
  territoryIds: string[];
}

/**
 * One of the workspace's roles (incr/0046): a copy of a preset, or the
 * tenant's own. `code` is the anchor and never changes; `name`, the order and
 * the grants are theirs.
 */
export interface WorkspaceRole {
  id: string;
  code: string;
  name: string;
  /** One sentence on what it is for; '' when the tenant wrote none. */
  description: string;
  /** Which business line it serves and which rung it stands on (0047):
   *  the workspace's own vocabulary rows, resolved; null for a role made
   *  before either existed, or whose group was never chosen. */
  line: RoleGroup | null;
  rank: RoleGroup | null;
  sortOrder: number;
  /** In catalogue order, so two roles compare without sorting. */
  permissions: PermCode[];
}

/**
 * One row of a grouping vocabulary (incr/0047): a 业务线 or a 层级. `code` is
 * the anchor and never changes; `name` and the order are the tenant's. The
 * same shape 行业分类 has, for the same reason.
 */
export interface RoleGroup {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
}

export type RoleGroupKind = "line" | "rank";

export interface AuthzStore {
  /**
   * Lazy upsert on sighting. `created` is true only on the very first sighting,
   * which is what the workspace-owner bootstrap keys off - re-running it on
   * every login would resurrect a role an admin deliberately removed.
   */
  seeMember(m: MemberSighting): Promise<{ memberId: string; created: boolean }>;
  rolesOf(workspaceId: string, sub: string): Promise<string[]>;
  /**
   * Effective permissions: the union of what the member's WORKSPACE roles
   * hold (incr/0046). The database join is the runtime authority; the
   * in-memory adapter keeps the same rows and answers the same way.
   */
  permissionsOf(workspaceId: string, sub: string): Promise<PermCode[]>;
  /**
   * Grant one of the workspace's roles. A code the workspace does not have
   * THROWS in both adapters - the service refuses it first, in the product's
   * words (role_unknown); this is the last line, and it must not be a silent
   * no-op in one adapter and a foreign-key error in the other.
   */
  grantRole(workspaceId: string, sub: string, role: string): Promise<void>;
  revokeRole(workspaceId: string, sub: string, role: string): Promise<void>;
  /* --- 角色 (incr/0046) -----------------------------------------------------
     The workspace's own list. A workspace starts from the presets - copied on
     its first sighting - and edits from there; the presets stay what they
     were, in local_authz.role, so a reset has something to reset to. */
  /** The nine presets, as the catalogue seeds them, in catalogue order. */
  listPresetRoles(): Promise<PresetRole[]>;
  /** This workspace's roles, in sort_order. */
  listRoles(workspaceId: string): Promise<WorkspaceRole[]>;
  /**
   * Copy the presets in, ONLY when the workspace has no roles at all. Returns
   * true when it did. Called on a member's first sighting and before the
   * first grant, so a workspace is never asked to assign a role it does not
   * have; a workspace that has roles - any roles - is left exactly as it is.
   */
  seedPresetRoles(workspaceId: string): Promise<boolean>;
  /**
   * Create a role, or set an existing code's name, order and grants. The
   * grants are stated WHOLE and replaced whole - the form states the whole
   * set, and the link table has nothing to update, only rows to add and drop.
   */
  upsertRole(
    workspaceId: string,
    input: {
      code: string; name: string; description: string;
      /** Ids of the workspace's own vocabulary rows; null leaves it ungrouped. */
      lineId: string | null; rankId: string | null;
      sortOrder?: number; permissions: readonly PermCode[];
    },
  ): Promise<WorkspaceRole>;
  /* --- 业务线 / 层级 (incr/0047) ---------------------------------------------
     Two vocabularies the workspace owns, the shape 行业分类 has: list in
     order, upsert by code (a known code renames), re-order, remove - which
     the FK RESTRICTs while a role stands in the group. `kind` picks the
     table; the verbs are otherwise identical, and so is the screen. */
  listRoleGroups(workspaceId: string, kind: RoleGroupKind): Promise<RoleGroup[]>;
  upsertRoleGroup(workspaceId: string, kind: RoleGroupKind, input: { code: string; name: string }): Promise<RoleGroup>;
  setRoleGroupOrder(workspaceId: string, kind: RoleGroupKind, orders: readonly { id: string; sortOrder: number }[]): Promise<void>;
  /** False when the id is not here. Throws while a role stands in it. */
  removeRoleGroup(workspaceId: string, kind: RoleGroupKind, id: string): Promise<boolean>;
  /** How many of the workspace's roles stand in this group. */
  countRolesInGroup(workspaceId: string, kind: RoleGroupKind, id: string): Promise<number>;
  /** Remove a role nobody holds. False when the code is not here. The
   *  service refuses a held role first; the FK (RESTRICT) refuses it last. */
  removeRole(workspaceId: string, code: string): Promise<boolean>;
  /**
   * Mark a member active or inactive. The row is NEVER deleted.
   *
   * `local_authz.member` has carried `CHECK (status IN ('active','inactive'))`
   * and an UPDATE grant on the column since the baseline, and nothing ever
   * wrote anything but 'active' - the schema anticipated departures and the
   * code never implemented one.
   *
   * DELETING IS NOT AN OPTION, and not for referential reasons: every
   * attribution column in the product (`agent_action.decided_by_sub`,
   * `line_discount_approval.approved_by_sub`,
   * `opportunity_stage_event.actor_sub`) stores the sub as plain text, so a
   * delete breaks no foreign key. It does something quieter and worse - it
   * removes the only row that maps `usr_<uuid>` to a name, and every signature
   * in the audit trail becomes unreadable.
   */
  setMemberStatus(workspaceId: string, sub: string, status: "active" | "inactive"): Promise<void>;
  /**
   * What the administrator configured for this member, unresolved.
   *
   * `territoryIds` is what was ASSIGNED, not what it expands to - the hierarchy
   * walk needs territory rows this layer cannot read, and doing it here would
   * make authz depend on a domain.
   */
  getScope(workspaceId: string, sub: string): Promise<ScopeSetting>;
  setScope(workspaceId: string, sub: string, setting: ScopeSetting): Promise<void>;
  listMembers(workspaceId: string): Promise<MemberRecord[]>;
}

/**
 * The composite map key, and the separator is NUL on purpose.
 *
 * A workspace id is a UUID and a sub comes from the IdP; neither can contain
 * U+0000, so no pair of inputs can produce the same key as a different pair -
 * which a "-" or a ":" cannot promise.
 *
 * WRITTEN AS THE ESCAPE, not as the byte. This line used to carry a literal
 * NUL, and one byte was enough to make the whole file `data` rather than text:
 * grep answered "Binary file app/authz/store.ts matches" instead of the line,
 * so every recursive search of this codebase silently skipped this file. It
 * was found that way - a search for `displayName` returned a match it would
 * not show. ascii-containment.test.ts now refuses a raw control byte anywhere
 * in the tree; the runtime value is identical.
 */
function key(workspaceId: string, sub: string): string {
  return `${workspaceId}\0${sub}`;
}

/** A role as the memory store keeps it: the group by id, like the table. */
type StoredRole = Omit<WorkspaceRole, "line" | "rank"> & { lineId: string | null; rankId: string | null };

export class InMemoryAuthzStore implements AuthzStore {
  private members = new Map<string, MemberRecord>();
  /** workspaceId -> its roles, by code, in insertion order (sorted on read).
   *  The group is held by id and resolved on read, like the table does. */
  private roles = new Map<string, Map<string, StoredRole>>();
  /** `${workspaceId}|line` / `|rank` -> that vocabulary's rows. */
  private groups = new Map<string, RoleGroup[]>();
  private nextId = 1;

  private groupKey(workspaceId: string, kind: RoleGroupKind): string {
    return `${workspaceId}|${kind}`;
  }

  private groupRows(workspaceId: string, kind: RoleGroupKind): RoleGroup[] {
    const k = this.groupKey(workspaceId, kind);
    let rows = this.groups.get(k);
    if (!rows) { rows = []; this.groups.set(k, rows); }
    return rows;
  }

  private resolve(workspaceId: string, r: StoredRole): WorkspaceRole {
    const { lineId, rankId, ...rest } = r;
    return {
      ...rest,
      permissions: [...r.permissions],
      line: this.groupRows(workspaceId, "line").find((g) => g.id === lineId) ?? null,
      rank: this.groupRows(workspaceId, "rank").find((g) => g.id === rankId) ?? null,
    };
  }

  /** The shipped lists, when the vocabulary is EMPTY - the 0040 guard. */
  private seedGroups(workspaceId: string): void {
    for (const [kind, list] of [["line", DEFAULT_ROLE_LINES], ["rank", DEFAULT_ROLE_RANKS]] as const) {
      const rows = this.groupRows(workspaceId, kind);
      if (rows.length > 0) continue;
      list.forEach((g, i) => rows.push({ id: `${kind}_${this.nextId++}`, code: g.code, name: g.name, sortOrder: i + 1 }));
    }
  }

  private groupId(workspaceId: string, kind: RoleGroupKind, code: string): string | null {
    return this.groupRows(workspaceId, kind).find((g) => g.code === code)?.id ?? null;
  }

  async seeMember(m: MemberSighting): Promise<{ memberId: string; created: boolean }> {
    const k = key(m.workspaceId, m.sub);
    const existing = this.members.get(k);
    if (existing) {
      // Refresh the platform display cache; never touch roles or status.
      if (m.displayName !== undefined) existing.displayName = m.displayName ?? null;
      return { memberId: existing.memberId, created: false };
    }
    const record: MemberRecord = {
      memberId: `mem_${this.nextId++}`,
      workspaceId: m.workspaceId,
      sub: m.sub,
      displayName: m.displayName ?? null,
      status: "active",
      roles: [],
      // UNSCOPED ON FIRST SIGHTING. Narrowing is the administrator's act; a
      // member appearing for the first time must not arrive already restricted.
      scope: "workspace",
      territoryIds: [],
    };
    this.members.set(k, record);
    return { memberId: record.memberId, created: true };
  }

  async rolesOf(workspaceId: string, sub: string): Promise<string[]> {
    return [...(this.members.get(key(workspaceId, sub))?.roles ?? [])];
  }

  async permissionsOf(workspaceId: string, sub: string): Promise<PermCode[]> {
    const held = new Set(await this.rolesOf(workspaceId, sub));
    const out = new Set<PermCode>();
    for (const r of await this.listRoles(workspaceId)) {
      if (!held.has(r.code)) continue;
      for (const p of r.permissions) out.add(p);
    }
    // Catalogue order, so callers can compare without sorting.
    return PERM_CODES.filter((p) => out.has(p));
  }

  async grantRole(workspaceId: string, sub: string, role: string): Promise<void> {
    /* THE FIRST GRANT MATERIALISES THE PRESETS, so the owner bootstrap and the
       demo seeder - both of which grant into a workspace nobody has listed
       yet - find the role they name. A workspace with roles is untouched. */
    await this.seedPresetRoles(workspaceId);
    if (!this.roles.get(workspaceId)?.has(role)) {
      throw new Error(`role ${role} is not a role of this workspace`);
    }
    const { memberId } = await this.seeMember({ workspaceId, sub });
    const record = [...this.members.values()].find((r) => r.memberId === memberId)!;
    if (!record.roles.includes(role)) record.roles.push(role);
  }

  async revokeRole(workspaceId: string, sub: string, role: string): Promise<void> {
    const record = this.members.get(key(workspaceId, sub));
    if (!record) return;
    record.roles = record.roles.filter((r) => r !== role);
  }

  async listPresetRoles(): Promise<PresetRole[]> {
    return presetRoles();
  }

  async listRoles(workspaceId: string): Promise<WorkspaceRole[]> {
    return [...(this.roles.get(workspaceId)?.values() ?? [])]
      .map((r) => this.resolve(workspaceId, r))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  }

  async seedPresetRoles(workspaceId: string): Promise<boolean> {
    if ((this.roles.get(workspaceId)?.size ?? 0) > 0) return false;
    // The vocabularies first, so a preset's line and rung resolve to rows.
    this.seedGroups(workspaceId);
    for (const p of presetRoles()) {
      await this.upsertRole(workspaceId, {
        code: p.code, name: p.name, description: p.description,
        lineId: this.groupId(workspaceId, "line", p.line), rankId: this.groupId(workspaceId, "rank", p.rank),
        sortOrder: p.sortOrder, permissions: p.permissions,
      });
    }
    return true;
  }

  async listRoleGroups(workspaceId: string, kind: RoleGroupKind): Promise<RoleGroup[]> {
    return [...this.groupRows(workspaceId, kind)]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
      .map((g) => ({ ...g }));
  }

  async upsertRoleGroup(workspaceId: string, kind: RoleGroupKind, input: { code: string; name: string }): Promise<RoleGroup> {
    const rows = this.groupRows(workspaceId, kind);
    const at = rows.findIndex((g) => g.code === input.code);
    if (at >= 0) {
      // The code is the anchor: an upsert on it renames, never re-keys.
      rows[at] = { ...rows[at]!, name: input.name };
      return { ...rows[at]! };
    }
    const tail = Math.max(0, ...rows.map((g) => g.sortOrder));
    const row: RoleGroup = { id: `${kind}_${this.nextId++}`, code: input.code, name: input.name, sortOrder: tail + 1 };
    rows.push(row);
    return { ...row };
  }

  async setRoleGroupOrder(workspaceId: string, kind: RoleGroupKind, orders: readonly { id: string; sortOrder: number }[]): Promise<void> {
    const want = new Map(orders.map((o) => [o.id, o.sortOrder]));
    const rows = this.groupRows(workspaceId, kind);
    rows.forEach((g, i) => { if (want.has(g.id)) rows[i] = { ...g, sortOrder: want.get(g.id)! }; });
  }

  async removeRoleGroup(workspaceId: string, kind: RoleGroupKind, id: string): Promise<boolean> {
    const rows = this.groupRows(workspaceId, kind);
    const at = rows.findIndex((g) => g.id === id);
    if (at < 0) return false;
    // The FK's rule (RESTRICT), kept here so the two adapters agree.
    if ((await this.countRolesInGroup(workspaceId, kind, id)) > 0) {
      throw new Error(`${kind} ${id} still has roles in it`);
    }
    rows.splice(at, 1);
    return true;
  }

  async countRolesInGroup(workspaceId: string, kind: RoleGroupKind, id: string): Promise<number> {
    return [...(this.roles.get(workspaceId)?.values() ?? [])]
      .filter((r) => (kind === "line" ? r.lineId : r.rankId) === id).length;
  }

  async upsertRole(
    workspaceId: string,
    input: {
      code: string; name: string; description: string; lineId: string | null; rankId: string | null;
      sortOrder?: number; permissions: readonly PermCode[];
    },
  ): Promise<WorkspaceRole> {
    let ws = this.roles.get(workspaceId);
    if (!ws) { ws = new Map(); this.roles.set(workspaceId, ws); }
    const existing = ws.get(input.code);
    const wanted = new Set(input.permissions);
    // The FK's rule: a group id has to be one of this workspace's rows.
    for (const [kind, id] of [["line", input.lineId], ["rank", input.rankId]] as const) {
      if (id !== null && !this.groupRows(workspaceId, kind).some((g) => g.id === id)) {
        throw new Error(`${kind} ${id} is not a group of this workspace`);
      }
    }
    const row: StoredRole = {
      id: existing?.id ?? `role_${this.nextId++}`,
      code: input.code,
      name: input.name,
      description: input.description,
      lineId: input.lineId,
      rankId: input.rankId,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? ws.size + 1,
      permissions: PERM_CODES.filter((p) => wanted.has(p)),
    };
    ws.set(input.code, row);
    return this.resolve(workspaceId, row);
  }

  async removeRole(workspaceId: string, code: string): Promise<boolean> {
    const ws = this.roles.get(workspaceId);
    if (!ws?.has(code)) return false;
    // The FK's rule (RESTRICT), kept here so the two adapters agree: a role
    // somebody holds is not removed, whatever the caller checked.
    for (const m of this.members.values()) {
      if (m.workspaceId === workspaceId && m.roles.includes(code)) {
        throw new Error(`role ${code} is still held by ${m.sub}`);
      }
    }
    ws.delete(code);
    return true;
  }

  async setMemberStatus(
    workspaceId: string,
    sub: string,
    status: "active" | "inactive",
  ): Promise<void> {
    const record = this.members.get(key(workspaceId, sub));
    if (!record) return;
    record.status = status;
  }

  async getScope(workspaceId: string, sub: string): Promise<ScopeSetting> {
    const record = this.members.get(key(workspaceId, sub));
    // A SUB WITH NO ROW IS UNSCOPED, not invisible. Somebody the workspace has
    // never seen has had nothing decided about them, and defaulting to a
    // narrow scope here would hide rows from a member whose row simply has not
    // been written yet.
    if (!record) return { kind: "workspace", territoryIds: [] };
    return {
      kind: isDataScope(record.scope) ? record.scope : "workspace",
      territoryIds: [...record.territoryIds],
    };
  }

  async setScope(workspaceId: string, sub: string, setting: ScopeSetting): Promise<void> {
    const record = this.members.get(key(workspaceId, sub));
    if (!record) return;
    record.scope = setting.kind;
    // The assignment is replaced wholesale, matching the DDL: an assignment is
    // a pair with no third column, so changing which territories somebody
    // covers is a delete and an insert rather than an edit.
    record.territoryIds = [...setting.territoryIds];
  }

  async listMembers(workspaceId: string): Promise<MemberRecord[]> {
    return [...this.members.values()]
      .filter((r) => r.workspaceId === workspaceId)
      .map((r) => ({ ...r, roles: [...r.roles] }));
  }

  /** Test helper: preload a member with roles without going through login.
   *  The presets are materialised first, the way the first grant does it, and
   *  a code the workspace does not have is dropped - the seed states a
   *  fixture, not a request. */
  seed(workspaceId: string, sub: string, roles: readonly string[]): void {
    let ws = this.roles.get(workspaceId);
    if (!ws || ws.size === 0) {
      ws = new Map();
      this.roles.set(workspaceId, ws);
      this.seedGroups(workspaceId);
      for (const p of presetRoles()) {
        ws.set(p.code, {
          id: `role_${this.nextId++}`, code: p.code, name: p.name, description: p.description,
          lineId: this.groupId(workspaceId, "line", p.line), rankId: this.groupId(workspaceId, "rank", p.rank),
          sortOrder: p.sortOrder, permissions: [...p.permissions],
        });
      }
    }
    const k = key(workspaceId, sub);
    this.members.set(k, {
      memberId: `mem_${this.nextId++}`,
      workspaceId,
      sub,
      displayName: null,
      status: "active",
      roles: roles.filter((r) => ws!.has(r)),
      scope: "workspace",
      territoryIds: [],
    });
  }
}

let override: AuthzStore | null = null;

/**
 * The memo, on globalThis rather than in module scope.
 *
 * THE SAME DEFECT domains/shared/registry.ts documents, in the one store that
 * never got the fix. Next evaluates server actions and RSC renders in SEPARATE
 * module graphs, so a module-level singleton is instantiated once per layer and
 * each layer gets its own copy. For the in-memory adapter that means
 * `resolveAuthzContext` records a member sighting at sign-in against one
 * instance while /admin/members renders from another - so the roster showed
 * "还没有成员" on a workspace whose only member was looking at the screen.
 *
 * Found by trying to verify the deactivation control and discovering there was
 * nobody to deactivate.
 *
 * Production never saw it: with DATABASE_URL set both instances are
 * PrismaAuthzStore and the shared state is the database. It is a demo-path
 * defect, which is exactly where nobody thinks to look.
 *
 * NOT imported from the domain registry, tempting as that is: authz sits UNDER
 * the domains and must not depend on one. Same technique, own symbol.
 */
const MEMO = Symbol.for("yucer.authz-store");

function memoSlot(): { store?: AuthzStore } {
  const g = globalThis as unknown as Record<symbol, { store?: AuthzStore } | undefined>;
  if (!g[MEMO]) g[MEMO] = {};
  return g[MEMO];
}

export function getAuthzStore(): AuthzStore {
  if (override) return override;
  const slot = memoSlot();
  if (slot.store) return slot.store;
  slot.store = prismaEnabled() ? new PrismaAuthzStore() : new InMemoryAuthzStore();
  return slot.store;
}

/** Tests inject a fresh store; pass null to clear. */
export function setAuthzStore(next: AuthzStore | null): void {
  override = next;
  memoSlot().store = undefined;
}
