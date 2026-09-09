import type { AuthzStore, MemberRecord, MemberSighting, RoleGroup, RoleGroupKind, WorkspaceRole } from "./store";
import { isDataScope, type DataScopeKind, type ScopeSetting } from "./scope";
import { getPrismaClient } from "../lib/db";
import { DEFAULT_ROLE_LINES, DEFAULT_ROLE_RANKS, PERM_CODES, isPermCode, isRoleCode, type PermCode, type PresetRole, type RoleLine, type RoleRank } from "./catalog";

// Prisma-backed AuthzStore over local_authz. Used when DATABASE_URL is set;
// @prisma/client loads lazily via getPrismaClient().
//
// The Prisma models carry scalar foreign keys with no @relation blocks (the
// schema comment explains why: the DDL owns referential integrity, Prisma is a
// client-generation source only), so every join here is explicit. Joins are
// batched with `in` rather than issued per row - a member with seven roles must
// not cost seven round trips on a request path that runs on every gate check.
//
// Writes stay inside the column-level whitelist of 98_column_locks.sql:
// local_authz.member allows UPDATE only on (display_name, avatar_hash, status,
// updated_at), and member_role is insert/delete only - which is exactly why
// revokeRole deletes a row instead of flipping a flag.

/** A preset's group code, typed by the shipped lists it names into. A
    template outside them is a build ahead of this one; it reads as the
    first shipped code rather than as a type nothing here can name. */
const lineOf = (v: string): RoleLine => (DEFAULT_ROLE_LINES.some((g) => g.code === v) ? (v as RoleLine) : "sales");
const rankOf = (v: string): RoleRank => (DEFAULT_ROLE_RANKS.some((g) => g.code === v) ? (v as RoleRank) : "staff");

type GroupRow = { id: string; workspaceId: string; name: string; sortOrder: number; lineCode?: string; rankCode?: string };
const toGroup = (r: GroupRow): RoleGroup => ({ id: r.id, code: r.lineCode ?? r.rankCode ?? "", name: r.name, sortOrder: r.sortOrder });

export class PrismaAuthzStore implements AuthzStore {
  async seeMember(m: MemberSighting): Promise<{ memberId: string; created: boolean }> {
    const p = await getPrismaClient();
    const where = { workspaceId_sub: { workspaceId: m.workspaceId, sub: m.sub } };

    const existing = await p.member.findUnique({ where });
    if (existing) {
      // Refresh the platform display cache only when the caller supplied one, so
      // a sighting without profile data does not blank a good cached value.
      if (m.displayName !== undefined || m.avatarHash !== undefined) {
        await p.member.update({
          where,
          data: {
            ...(m.displayName !== undefined ? { displayName: m.displayName } : {}),
            ...(m.avatarHash !== undefined ? { avatarHash: m.avatarHash } : {}),
            updatedAt: new Date(),
          },
        });
      }
      return { memberId: existing.id, created: false };
    }

    try {
      const row = await p.member.create({
        data: {
          workspaceId: m.workspaceId,
          sub: m.sub,
          displayName: m.displayName ?? null,
          avatarHash: m.avatarHash ?? null,
        },
      });
      return { memberId: row.id, created: true };
    } catch {
      // Lost a race against a concurrent first login (uidx_member_ws_sub). The
      // row exists now and this caller is NOT the creator - reporting created
      // here would run the owner bootstrap twice.
      const row = await p.member.findUnique({ where });
      if (!row) throw new Error("member upsert failed and the row is still absent");
      return { memberId: row.id, created: false };
    }
  }

  async rolesOf(workspaceId: string, sub: string): Promise<string[]> {
    const p = await getPrismaClient();
    const member = await p.member.findUnique({
      where: { workspaceId_sub: { workspaceId, sub } },
    });
    if (!member) return [];
    return this.roleCodesForMembers([member.id]).then((m) => m.get(member.id) ?? []);
  }

  async permissionsOf(workspaceId: string, sub: string): Promise<PermCode[]> {
    const p = await getPrismaClient();
    const member = await p.member.findUnique({
      where: { workspaceId_sub: { workspaceId, sub } },
    });
    if (!member) return [];

    const links = await p.memberRole.findMany({ where: { memberId: member.id } });
    if (links.length === 0) return [];
    const roleIds = links.map((l: { roleId: string }) => l.roleId);

    // Since 0046 the link names the WORKSPACE'S role, and the grants are its
    // own rows. Two queries whatever the member holds.
    const grants = await p.workspaceRolePermission.findMany({
      where: { workspaceRoleId: { in: roleIds } },
    });
    if (grants.length === 0) return [];
    const permIds = [...new Set(grants.map((g: { permissionId: string }) => g.permissionId))];

    const perms = await p.permission.findMany({ where: { id: { in: permIds } } });
    // Unknown codes are dropped rather than passed through: the database catalog
    // can be ahead of this build, and an unrecognized permission must not widen
    // anything just because it exists. Catalogue order, like the memory store.
    const held = new Set(perms.map((r: { permCode: string }) => r.permCode).filter(isPermCode));
    return PERM_CODES.filter((c) => held.has(c));
  }

  async grantRole(workspaceId: string, sub: string, role: string): Promise<void> {
    const p = await getPrismaClient();
    const { memberId } = await this.seeMember({ workspaceId, sub });
    // The first grant into a workspace with no roles brings the presets in -
    // the owner bootstrap and the demo seeder both grant before anybody has
    // listed. A workspace with roles is untouched (the store's own rule).
    await this.seedPresetRoles(workspaceId);
    const roleRow = await p.workspaceRole.findUnique({
      where: { workspaceId_roleCode: { workspaceId, roleCode: role } },
    });
    if (!roleRow) throw new Error(`role ${role} is not a role of this workspace`);
    try {
      await p.memberRole.create({ data: { memberId, roleId: roleRow.id } });
    } catch {
      // uidx_member_role_member_role - already granted, which is the desired end
      // state. member_role has no UPDATE grant, so there is nothing else to do.
    }
  }

  async revokeRole(workspaceId: string, sub: string, role: string): Promise<void> {
    const p = await getPrismaClient();
    const member = await p.member.findUnique({
      where: { workspaceId_sub: { workspaceId, sub } },
    });
    if (!member) return;
    const roleRow = await p.workspaceRole.findUnique({
      where: { workspaceId_roleCode: { workspaceId, roleCode: role } },
    });
    if (!roleRow) return;
    await p.memberRole.deleteMany({ where: { memberId: member.id, roleId: roleRow.id } });
  }

  /* --- 角色 (incr/0046) ---------------------------------------------------- */

  async listPresetRoles(): Promise<PresetRole[]> {
    const p = await getPrismaClient();
    const [roles, grants, perms] = await Promise.all([
      p.role.findMany({ orderBy: [{ sortOrder: "asc" }, { roleCode: "asc" }] }),
      p.rolePermission.findMany(),
      p.permission.findMany(),
    ]);
    const codeOf = new Map<string, string>(perms.map((x: { id: string; permCode: string }) => [x.id, x.permCode]));
    const held = new Map<string, Set<string>>();
    for (const g of grants as Array<{ roleId: string; permissionId: string }>) {
      const set = held.get(g.roleId) ?? new Set<string>();
      set.add(codeOf.get(g.permissionId) ?? "");
      held.set(g.roleId, set);
    }
    // A preset outside the mirror is dropped rather than typed loosely: the
    // table can be ahead of this build, and the presets a build offers are the
    // ones it can name.
    return roles
      .filter((r: { roleCode: string }) => isRoleCode(r.roleCode))
      .map((r: { id: string; roleCode: string; name: string; description: string; businessLine: string; rank: string; sortOrder: number }) => ({
        code: r.roleCode as PresetRole["code"],
        name: r.name,
        description: r.description,
        line: lineOf(r.businessLine),
        rank: rankOf(r.rank),
        sortOrder: r.sortOrder,
        permissions: PERM_CODES.filter((c) => held.get(r.id)?.has(c)),
      }));
  }

  async listRoles(workspaceId: string): Promise<WorkspaceRole[]> {
    const p = await getPrismaClient();
    const roles = await p.workspaceRole.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { roleCode: "asc" }],
    });
    if (roles.length === 0) return [];
    const ids = roles.map((r: { id: string }) => r.id);
    const [grants, perms, lines, ranks] = await Promise.all([
      p.workspaceRolePermission.findMany({ where: { workspaceRoleId: { in: ids } } }),
      p.permission.findMany(),
      this.listRoleGroups(workspaceId, "line"),
      this.listRoleGroups(workspaceId, "rank"),
    ]);
    const lineById = new Map(lines.map((g) => [g.id, g]));
    const rankById = new Map(ranks.map((g) => [g.id, g]));
    const codeOf = new Map<string, string>(perms.map((x: { id: string; permCode: string }) => [x.id, x.permCode]));
    const held = new Map<string, Set<string>>();
    for (const g of grants as Array<{ workspaceRoleId: string; permissionId: string }>) {
      const set = held.get(g.workspaceRoleId) ?? new Set<string>();
      set.add(codeOf.get(g.permissionId) ?? "");
      held.set(g.workspaceRoleId, set);
    }
    return roles.map((r: { id: string; roleCode: string; name: string; description: string; lineId: string | null; rankId: string | null; sortOrder: number }) => ({
      id: r.id,
      code: r.roleCode,
      name: r.name,
      description: r.description,
      line: (r.lineId && lineById.get(r.lineId)) || null,
      rank: (r.rankId && rankById.get(r.rankId)) || null,
      sortOrder: r.sortOrder,
      permissions: PERM_CODES.filter((c) => held.get(r.id)?.has(c)),
    }));
  }

  async seedPresetRoles(workspaceId: string): Promise<boolean> {
    const p = await getPrismaClient();
    if ((await p.workspaceRole.count({ where: { workspaceId } })) > 0) return false;
    // The vocabularies first, when EMPTY (the 0040 guard), so a preset's
    // line and rung resolve to rows of this workspace's own.
    await this.seedGroups(workspaceId);
    const [lines, ranks] = await Promise.all([
      this.listRoleGroups(workspaceId, "line"), this.listRoleGroups(workspaceId, "rank"),
    ]);
    // FROM THE TABLE, not the mirror: local_authz.role is the runtime authority
    // and this is a copy of its rows, the same copy incr/0046 made for the
    // workspaces that were already there.
    for (const preset of await this.listPresetRoles()) {
      await this.upsertRole(workspaceId, {
        code: preset.code, name: preset.name, description: preset.description,
        lineId: lines.find((g) => g.code === preset.line)?.id ?? null,
        rankId: ranks.find((g) => g.code === preset.rank)?.id ?? null,
        sortOrder: preset.sortOrder, permissions: preset.permissions,
      });
    }
    return true;
  }

  /** The shipped lists into an EMPTY vocabulary - the same guard 0047 used. */
  private async seedGroups(workspaceId: string): Promise<void> {
    const p = await getPrismaClient();
    if ((await p.roleLine.count({ where: { workspaceId } })) === 0) {
      await p.roleLine.createMany({
        data: DEFAULT_ROLE_LINES.map((g, i) => ({ workspaceId, lineCode: g.code, name: g.name, sortOrder: i + 1 })),
        skipDuplicates: true,
      });
    }
    if ((await p.roleRank.count({ where: { workspaceId } })) === 0) {
      await p.roleRank.createMany({
        data: DEFAULT_ROLE_RANKS.map((g, i) => ({ workspaceId, rankCode: g.code, name: g.name, sortOrder: i + 1 })),
        skipDuplicates: true,
      });
    }
  }

  async listRoleGroups(workspaceId: string, kind: RoleGroupKind): Promise<RoleGroup[]> {
    const p = await getPrismaClient();
    const order = [{ sortOrder: "asc" as const }, kind === "line" ? { lineCode: "asc" as const } : { rankCode: "asc" as const }];
    const rows = kind === "line"
      ? await p.roleLine.findMany({ where: { workspaceId }, orderBy: order })
      : await p.roleRank.findMany({ where: { workspaceId }, orderBy: order });
    return (rows as GroupRow[]).map(toGroup);
  }

  async upsertRoleGroup(workspaceId: string, kind: RoleGroupKind, input: { code: string; name: string }): Promise<RoleGroup> {
    const p = await getPrismaClient();
    const update = { name: input.name, updatedAt: new Date() };
    if (kind === "line") {
      const tail = await p.roleLine.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
      const row = await p.roleLine.upsert({
        where: { workspaceId_lineCode: { workspaceId, lineCode: input.code } },
        update,
        create: { workspaceId, lineCode: input.code, sortOrder: (tail._max?.sortOrder ?? 0) + 1, ...update },
      });
      return toGroup(row as GroupRow);
    }
    const tail = await p.roleRank.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
    const row = await p.roleRank.upsert({
      where: { workspaceId_rankCode: { workspaceId, rankCode: input.code } },
      update,
      create: { workspaceId, rankCode: input.code, sortOrder: (tail._max?.sortOrder ?? 0) + 1, ...update },
    });
    return toGroup(row as GroupRow);
  }

  async setRoleGroupOrder(workspaceId: string, kind: RoleGroupKind, orders: readonly { id: string; sortOrder: number }[]): Promise<void> {
    const p = await getPrismaClient();
    for (const o of orders) {
      const data = { sortOrder: o.sortOrder, updatedAt: new Date() };
      if (kind === "line") await p.roleLine.updateMany({ where: { workspaceId, id: o.id }, data });
      else await p.roleRank.updateMany({ where: { workspaceId, id: o.id }, data });
    }
  }

  async removeRoleGroup(workspaceId: string, kind: RoleGroupKind, id: string): Promise<boolean> {
    const p = await getPrismaClient();
    // The service refused a group in use; the FK RESTRICTs underneath.
    const { count } = kind === "line"
      ? await p.roleLine.deleteMany({ where: { workspaceId, id } })
      : await p.roleRank.deleteMany({ where: { workspaceId, id } });
    return count > 0;
  }

  async countRolesInGroup(workspaceId: string, kind: RoleGroupKind, id: string): Promise<number> {
    const p = await getPrismaClient();
    return p.workspaceRole.count({ where: kind === "line" ? { workspaceId, lineId: id } : { workspaceId, rankId: id } });
  }

  async upsertRole(
    workspaceId: string,
    input: {
      code: string; name: string; description: string; lineId: string | null; rankId: string | null;
      sortOrder?: number; permissions: readonly PermCode[];
    },
  ): Promise<WorkspaceRole> {
    const p = await getPrismaClient();
    const where = { workspaceId_roleCode: { workspaceId, roleCode: input.code } };
    const existing = await p.workspaceRole.findUnique({ where });
    let id: string;
    if (existing) {
      // name / sort_order / updated_at - the UPDATE whitelist 0046 grants.
      await p.workspaceRole.update({
        where,
        data: {
          name: input.name,
          description: input.description,
          lineId: input.lineId,
          rankId: input.rankId,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          updatedAt: new Date(),
        },
      });
      id = existing.id;
    } else {
      const sortOrder = input.sortOrder ?? (await p.workspaceRole.count({ where: { workspaceId } })) + 1;
      const row = await p.workspaceRole.create({
        data: {
          workspaceId, roleCode: input.code, name: input.name, description: input.description,
          lineId: input.lineId, rankId: input.rankId, sortOrder,
        },
      });
      id = row.id;
    }
    // The grants, replaced whole: the link table has rows to add and rows to
    // drop, and nothing to update. Only the difference is written.
    const wanted = new Set(input.permissions);
    const perms = await p.permission.findMany({ where: { permCode: { in: [...wanted] } } });
    const wantedIds = new Set<string>(perms.map((x: { id: string }) => x.id));
    const current = await p.workspaceRolePermission.findMany({ where: { workspaceRoleId: id } });
    const currentIds = new Set<string>(current.map((x: { permissionId: string }) => x.permissionId));
    const drop = [...currentIds].filter((x) => !wantedIds.has(x));
    const add = [...wantedIds].filter((x) => !currentIds.has(x));
    if (drop.length > 0) {
      await p.workspaceRolePermission.deleteMany({
        where: { workspaceRoleId: id, permissionId: { in: drop } },
      });
    }
    if (add.length > 0) {
      await p.workspaceRolePermission.createMany({
        data: add.map((permissionId) => ({ workspaceRoleId: id, permissionId })),
        skipDuplicates: true,
      });
    }
    const rows = await this.listRoles(workspaceId);
    return rows.find((r) => r.code === input.code)!;
  }

  async removeRole(workspaceId: string, code: string): Promise<boolean> {
    const p = await getPrismaClient();
    const row = await p.workspaceRole.findUnique({
      where: { workspaceId_roleCode: { workspaceId, roleCode: code } },
    });
    if (!row) return false;
    // The grants cascade (0046); a member link RESTRICTs, and the throw is
    // the database's own - the service refused a held role before this.
    await p.workspaceRole.delete({ where: { id: row.id } });
    return true;
  }

  async setMemberStatus(
    workspaceId: string,
    sub: string,
    status: "active" | "inactive",
  ): Promise<void> {
    const p = await getPrismaClient();
    // updateMany, not update: a sub with no row is a no-op rather than a throw,
    // matching revokeRole above. Deactivating somebody who never signed in is
    // not an error, it is a request that has already been satisfied.
    await p.member.updateMany({
      where: { workspaceId, sub },
      data: { status, updatedAt: new Date() },
    });
  }

  async listMembers(workspaceId: string): Promise<MemberRecord[]> {
    const p = await getPrismaClient();
    const members = await p.member.findMany({ where: { workspaceId } });
    if (members.length === 0) return [];
    const ids = members.map((m: { id: string }) => m.id);
    const byMember = await this.roleCodesForMembers(ids);
    // One query for every member's territories, not one per member - the same
    // shape roleCodesForMembers uses, and for the same reason.
    const assignments = await p.memberTerritory.findMany({ where: { memberId: { in: ids } } });
    const territoriesOf = new Map<string, string[]>();
    for (const a of assignments as Array<{ memberId: string; territoryId: string }>) {
      const list = territoriesOf.get(a.memberId);
      if (list) list.push(a.territoryId);
      else territoriesOf.set(a.memberId, [a.territoryId]);
    }
    return members.map(
      (m: {
        id: string;
        sub: string;
        displayName: string | null;
        status: string;
        scope: string;
      }) => ({
        memberId: m.id,
        workspaceId,
        sub: m.sub,
        displayName: m.displayName,
        status: m.status,
        roles: byMember.get(m.id) ?? [],
        // An unrecognised scope reads as `workspace`. The DDL has a CHECK, so
        // this is belt and braces - but the safe direction for a value that
        // decides visibility is the one that hides nothing unexpectedly.
        scope: isDataScope(m.scope) ? m.scope : ("workspace" as DataScopeKind),
        territoryIds: territoriesOf.get(m.id) ?? [],
      }),
    );
  }

  async getScope(workspaceId: string, sub: string): Promise<ScopeSetting> {
    const p = await getPrismaClient();
    const member = await p.member.findUnique({ where: { workspaceId_sub: { workspaceId, sub } } });
    // A sub with no row is unscoped, not invisible - see the in-memory store.
    if (!member) return { kind: "workspace", territoryIds: [] };
    const assignments = await p.memberTerritory.findMany({ where: { memberId: member.id } });
    return {
      kind: isDataScope(member.scope) ? member.scope : "workspace",
      territoryIds: (assignments as Array<{ territoryId: string }>).map((a) => a.territoryId),
    };
  }

  async setScope(workspaceId: string, sub: string, setting: ScopeSetting): Promise<void> {
    const p = await getPrismaClient();
    const member = await p.member.findUnique({ where: { workspaceId_sub: { workspaceId, sub } } });
    if (!member) return;
    await p.member.updateMany({
      where: { workspaceId, sub },
      data: { scope: setting.kind, updatedAt: new Date() },
    });
    // REPLACED WHOLESALE, matching the DDL: member_territory carries no UPDATE
    // grant at all, because an assignment is a pair with no third column to
    // change. Moving somebody between territories is a delete and an insert.
    await p.memberTerritory.deleteMany({ where: { memberId: member.id } });
    if (setting.territoryIds.length > 0) {
      await p.memberTerritory.createMany({
        data: setting.territoryIds.map((territoryId) => ({ memberId: member.id, territoryId })),
        skipDuplicates: true,
      });
    }
  }

  /** memberId -> role codes, in two queries regardless of how many members. */
  private async roleCodesForMembers(memberIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (memberIds.length === 0) return out;
    const p = await getPrismaClient();

    const links = await p.memberRole.findMany({ where: { memberId: { in: memberIds } } });
    if (links.length === 0) return out;

    const roleIds = [...new Set(links.map((l: { roleId: string }) => l.roleId))];
    // The workspace's own rows (0046). A link to a row that is not there -
    // which the FK forbids - reads as no role rather than as a made-up one.
    const roles = await p.workspaceRole.findMany({ where: { id: { in: roleIds } } });
    const codeById = new Map<string, string>(
      roles.map((r: { id: string; roleCode: string }) => [r.id, r.roleCode]),
    );

    for (const link of links as Array<{ memberId: string; roleId: string }>) {
      const code = codeById.get(link.roleId);
      if (!code) continue;
      const list = out.get(link.memberId) ?? [];
      list.push(code);
      out.set(link.memberId, list);
    }
    return out;
  }
}
