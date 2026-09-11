"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getPlanningStore } from "../../../domains/shared/registry";
import {
  applyOrgTemplate,
  listOrgUnits,
  moveOrgKind,
  moveOrgUnit,
  removeOrgKind,
  removeOrgUnit,
  reparentOrgUnit,
  saveOrgKind,
  setUnitDivisions,
  upsertOrgUnit,
  upsertTerritory,
} from "../../../domains/planning/service";
import { importDivisionTemplate, listCarves, listMarketDivisions } from "../../../domains/account/service";
import type { MoveDirection } from "../../../domains/shared/ordering";

/* 组织结构 的写入路径 (incr/0051).
 *
 * Returns the violation CODE, never its sentence: the rule layer writes its
 * messages for its own reader, and the interface looks the code up in
 * ORG_ERROR (TD-010).
 *
 * The tree is read by /admin/org, by the unit column on /admin/members and by
 * every form that offers a parent or a leader, so each write invalidates the
 * whole layout the way a role change does.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

async function ctx() {
  const session = await resolveAppSession();
  if (!session) return null;
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPlanningStore(),
  };
}

export async function saveOrgUnitAction(input: {
  unitCode: string;
  name: string;
  parentId: string | null;
  kindId: string;
  leaderSub: string | null;
}): Promise<Result<{ id: string }>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await upsertOrgUnit(c, input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true, id: r.value.id };
}

export async function removeOrgUnitAction(id: string): Promise<Result<{ unplaced: number; detached: number }>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await removeOrgUnit(c, id);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true, unplaced: r.value.unplaced, detached: r.value.detached };
}

/** Re-order a unit among its siblings. */
export async function moveOrgUnitAction(id: string, direction: MoveDirection): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await moveOrgUnit(c, { id, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 迁到… - a unit's own new parent, everything else about it unchanged. */
export async function reparentOrgUnitAction(id: string, parentId: string | null): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await reparentOrgUnit(c, { id, parentId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * 关联区域 (incr/0055, owner 2026-09-11: 抽屉挂的是销售区域，跟区域设置的
 * 大区对不上 - 组织到大区应该直连，不绕销售区域) - from the UNIT's own
 * side, set exactly which 大区 it is directly linked to.
 * `desiredDivisionIds` is the complete new set, not a delta - empty means
 * 暂不关联. Unlike the territory version this used to be, `org_unit_division`
 * is its own pair table (0055), so this is one direct write instead of a
 * loop of whole-territory upserts.
 */
export async function setUnitDivisionsAction(
  unitId: string,
  desiredDivisionIds: readonly string[],
): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const accountCtx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };
  const divisions = await listMarketDivisions(accountCtx);
  if (!divisions.ok) return { ok: false, error: divisions.violations[0]?.code ?? "denied" };
  const r = await setUnitDivisions(c, unitId, desiredDivisionIds, new Set(divisions.value.map((d) => d.id)));
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export interface ApplyStartupTemplateResult {
  readonly units: number;
  readonly unplaced: number;
  readonly detached: number;
  readonly divisions: number;
  readonly divisionsReplaced: number;
  readonly territories: number;
  readonly linkedUnits: number;
}

/**
 * 应用模版 面板优化 (owner, 2026-09-11): 一次把三件事按依赖顺序做完 -
 * 1) 组织架构模版 (三选一，不变的框架) - 单位要先存在，自动关联才有单位可配；
 * 2) 区域设置模版 (可选，五分法/七分法/不同步) - 销售区域要覆盖的大区得先
 *    存在；importDivisionTemplate 只回计数，不回行 id，新建的大区之后要
 *    listMarketDivisions 重新读一遍才拿得到 id；
 * 3) 每个新建的大区，新建一个同名的销售区域覆盖它 (AUTO-<大区代码> 为区码，
 *    upsert-by-code 使这一步天然幂等 - 再套一次同一份模版不会堆出重复行)，
 *    勾选了自动关联的话，把名字里带这个大区名字的机构挂上去 - 不是相等，是
 *    包含：中规模全国公司模版自己的注释就说"七个大区与七分法一致"，它的单位
 *    叫"华北大区"，七分法的大区叫"华北"，是同一个词加了后缀，不是同一个词，
 *    按相等匹配会一个都对不上（2026-09-11 实测验证过）。
 *
 * 0) 大区级组织结构也需要创建并关联 (owner, 2026-09-11) - 在套组织架构模版
 *    之前，先把选中的区域设置模版自己的大区名单读出来（listCarves，account
 *    域，不需要真的建出大区行才能拿到名字），传给 applyOrgTemplate：模版
 *    若是"区域感知"的（withMatchedRegions，见 lib/org.ts），大区一层就照着
 *    这份名单重建，而不是套用模版自带的那份固定名单（对七分法恰好 1:1，对
 *    五分法完全对不上）。小规模简单团队没有大区层，传不传都不影响它。
 *
 * 组织架构在 planning 域，区域设置在 account 域，销售区域在 planning 域但
 * 引用 account 域的大区 id - 三步分属两个域，没有跨域事务，前一步成了后一
 * 步才做；区域设置那步失败，组织架构已经落地的不回滚，销售区域那步就跳过，
 * 如实汇报做到了哪一步（跟 domains/judgement/service.ts 的说法一致：跨域
 * 拼装走各自的 SERVICE，不碰对方的 store）。
 */
export async function applyStartupTemplateAction(input: {
  readonly orgKey: string;
  readonly divisionKey: string | null;
  readonly autoAssociate: boolean;
}): Promise<Result<ApplyStartupTemplateResult>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const accountCtx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };

  let regions: { readonly code: string; readonly name: string }[] | undefined;
  if (input.divisionKey) {
    const carves = await listCarves(accountCtx);
    const picked = carves.ok ? carves.value.find((t) => t.key === input.divisionKey) : undefined;
    regions = picked?.divisions.map((d) => ({ code: d.code, name: d.name }));
  }

  const orgResult = await applyOrgTemplate(c, input.orgKey, regions);
  if (!orgResult.ok) return { ok: false, error: orgResult.violations[0]?.code ?? "denied" };

  let divisions = 0;
  let divisionsReplaced = 0;
  let territories = 0;
  let linkedUnits = 0;

  if (input.divisionKey) {
    const divisionResult = await importDivisionTemplate(accountCtx, input.divisionKey);
    if (divisionResult.ok) {
      divisions = divisionResult.value.divisions;
      divisionsReplaced = divisionResult.value.replaced;
      const divisionRows = await listMarketDivisions(accountCtx);
      const rows = divisionRows.ok ? divisionRows.value : [];
      const knownDivisionIds = new Set(rows.map((d) => d.id));
      const unitsResult = input.autoAssociate ? await listOrgUnits(c) : null;
      const units = unitsResult?.ok ? unitsResult.value : [];
      for (const d of rows) {
        const matchedUnitIds = units.filter((u) => u.name.includes(d.name)).map((u) => u.id);
        const territoryResult = await upsertTerritory(
          c,
          {
            territoryCode: `AUTO-${d.code}`,
            name: d.name,
            parentId: null,
            ownerSub: null,
            status: "active",
            divisionIds: [d.id],
            unitIds: matchedUnitIds,
          },
          knownDivisionIds,
        );
        if (territoryResult.ok) {
          territories += 1;
          linkedUnits += matchedUnitIds.length;
        }
      }
    }
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    units: orgResult.value.units,
    unplaced: orgResult.value.unplaced,
    detached: orgResult.value.detached,
    divisions,
    divisionsReplaced,
    territories,
    linkedUnits,
  };
}

/* --- 单位类型 ---------------------------------------------------------------- */

export async function saveOrgKindAction(input: { code: string; name: string }): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await saveOrgKind(c, { kindCode: input.code, name: input.name });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function moveOrgKindAction(id: string, direction: MoveDirection): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await moveOrgKind(c, { id, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeOrgKindAction(id: string): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await removeOrgKind(c, id);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}
