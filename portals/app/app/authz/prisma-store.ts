import type { AuthzStore, MemberRecord, MemberSighting } from "./store";
import { isDataScope, type DataScopeKind, type ScopeSetting } from "./scope";
import { getPrismaClient } from "../lib/db";
import { isPermCode, isRoleCode, type PermCode, type RoleCode } from "./catalog";

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

  async rolesOf(workspaceId: string, sub: string): Promise<RoleCode[]> {
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

    const grants = await p.rolePermission.findMany({ where: { roleId: { in: roleIds } } });
    if (grants.length === 0) return [];
    const permIds = [...new Set(grants.map((g: { permissionId: string }) => g.permissionId))];

    const perms = await p.permission.findMany({ where: { id: { in: permIds } } });
    // Unknown codes are dropped rather than passed through: the database catalog
    // can be ahead of this build, and an unrecognized permission must not widen
    // anything just because it exists.
    return [...new Set(perms.map((r: { permCode: string }) => r.permCode).filter(isPermCode))];
  }

  async grantRole(workspaceId: string, sub: string, role: RoleCode): Promise<void> {
    const p = await getPrismaClient();
    const { memberId } = await this.seeMember({ workspaceId, sub });
    const roleRow = await p.role.findUnique({ where: { roleCode: role } });
    if (!roleRow) throw new Error(`role ${role} is not in the seeded catalog`);
    try {
      await p.memberRole.create({ data: { memberId, roleId: roleRow.id } });
    } catch {
      // uidx_member_role_member_role - already granted, which is the desired end
      // state. member_role has no UPDATE grant, so there is nothing else to do.
    }
  }

  async revokeRole(workspaceId: string, sub: string, role: RoleCode): Promise<void> {
    const p = await getPrismaClient();
    const member = await p.member.findUnique({
      where: { workspaceId_sub: { workspaceId, sub } },
    });
    if (!member) return;
    const roleRow = await p.role.findUnique({ where: { roleCode: role } });
    if (!roleRow) return;
    await p.memberRole.deleteMany({ where: { memberId: member.id, roleId: roleRow.id } });
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
  private async roleCodesForMembers(memberIds: string[]): Promise<Map<string, RoleCode[]>> {
    const out = new Map<string, RoleCode[]>();
    if (memberIds.length === 0) return out;
    const p = await getPrismaClient();

    const links = await p.memberRole.findMany({ where: { memberId: { in: memberIds } } });
    if (links.length === 0) return out;

    const roleIds = [...new Set(links.map((l: { roleId: string }) => l.roleId))];
    const roles = await p.role.findMany({ where: { id: { in: roleIds } } });
    const codeById = new Map<string, string>(
      roles.map((r: { id: string; roleCode: string }) => [r.id, r.roleCode]),
    );

    for (const link of links as Array<{ memberId: string; roleId: string }>) {
      const code = codeById.get(link.roleId);
      if (!code || !isRoleCode(code)) continue;
      const list = out.get(link.memberId) ?? [];
      list.push(code);
      out.set(link.memberId, list);
    }
    return out;
  }
}
