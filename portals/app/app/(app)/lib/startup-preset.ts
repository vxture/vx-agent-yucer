import {
  applyOrgTemplate,
  listOrgUnits,
  setUnitDivisions,
  upsertTerritory,
  type PlanningContext,
} from "../../domains/planning/service";
import { importDivisionTemplate, listCarves, listMarketDivisions, type AccountContext } from "../../domains/account/service";

/**
 * 应用模版 - the whole 组织架构 + 区域设置 + 销售区域 orchestration, pulled out
 * of `admin/org/actions.ts`'s `applyStartupTemplateAction` (owner, 2026-09-11)
 * so a second caller - the new-workspace first-contact seed in `session.ts`
 * - can run exactly the same sequence without going through a Server Action
 * (which resolves its own session and would recurse: `session.ts` is what
 * calls this).
 *
 * THE ORDER IS THE DEPENDENCY, not a preference:
 * 1) `listCarves` reads the chosen division template's 大区 NAMES ONLY - no
 *    division row has to exist yet to know what they are called.
 * 2) `applyOrgTemplate` builds the tree with those names, region-aware
 *    templates (`national_medium`) regenerating their 大区 arm to match
 *    (`withMatchedRegions`, `planning/lib/org.ts`) rather than using the
 *    template's own static list - which for 五分法 would not match at all
 *    (七分法 is the template's built-in shape).
 * 3) `importDivisionTemplate` actually writes the 大区 rows; it returns only
 *    counts, so `listMarketDivisions` is read again afterwards for ids.
 * 4) Per 大区, one 销售区域 (`AUTO-<code>`, upsert-by-code so a second run is
 *    idempotent) covering it, with org units whose name CONTAINS the 大区's
 *    name auto-linked (owner 2026-09-11, verified by hand: the template's
 *    own units are named "华北大区", 七分法's own name is "华北" - a suffix,
 *    not an equal string).
 * 5) THE ONE STEP `applyStartupTemplateAction` DID NOT DO: each auto-linked
 *    unit also gets `setUnitDivisions` - the direct org_unit_division link
 *    (`incr/0055`, ADR-030's second relation). The territory link above
 *    answers "who works this ground"; this one answers "which 大区 does the
 *    unit itself belong to" - a different question the drawer UI already
 *    lets an admin answer by hand, now answered for the units this
 *    orchestration itself just created and matched.
 *
 * NO CROSS-DOMAIN TRANSACTION: 组织架构 is planning, 区域设置 is account,
 * 销售区域 is planning referencing account's ids - three steps, two domains,
 * no shared transaction. A later step's failure never rolls an earlier one
 * back; it reports how far it got, the same as `domains/judgement/service.ts`'s
 * own cross-domain assembly - "跨域拼装走各自的 SERVICE，不碰对方的 store".
 */
export interface StartupPresetResult {
  readonly units: number;
  readonly unplaced: number;
  readonly detached: number;
  readonly divisions: number;
  readonly divisionsReplaced: number;
  readonly territories: number;
  readonly linkedUnits: number;
  readonly linkedDivisions: number;
}

export type StartupPresetOutcome = ({ readonly ok: true } & StartupPresetResult) | { readonly ok: false; readonly error: string };

export async function applyStartupPreset(
  planningCtx: PlanningContext,
  accountCtx: AccountContext,
  input: { readonly orgKey: string; readonly divisionKey: string | null; readonly autoAssociate: boolean },
): Promise<StartupPresetOutcome> {
  let regions: { readonly code: string; readonly name: string }[] | undefined;
  if (input.divisionKey) {
    const carves = await listCarves(accountCtx);
    const picked = carves.ok ? carves.value.find((t) => t.key === input.divisionKey) : undefined;
    regions = picked?.divisions.map((d) => ({ code: d.code, name: d.name }));
  }

  const orgResult = await applyOrgTemplate(planningCtx, input.orgKey, regions);
  if (!orgResult.ok) return { ok: false, error: orgResult.violations[0]?.code ?? "denied" };

  let divisions = 0;
  let divisionsReplaced = 0;
  let territories = 0;
  let linkedUnits = 0;
  let linkedDivisions = 0;

  if (input.divisionKey) {
    const divisionResult = await importDivisionTemplate(accountCtx, input.divisionKey);
    if (divisionResult.ok) {
      divisions = divisionResult.value.divisions;
      divisionsReplaced = divisionResult.value.replaced;
      const divisionRows = await listMarketDivisions(accountCtx);
      const rows = divisionRows.ok ? divisionRows.value : [];
      const knownDivisionIds = new Set(rows.map((d) => d.id));
      const unitsResult = input.autoAssociate ? await listOrgUnits(planningCtx) : null;
      const units = unitsResult?.ok ? unitsResult.value : [];
      for (const d of rows) {
        const matchedUnitIds = units.filter((u) => u.name.includes(d.name)).map((u) => u.id);
        const territoryResult = await upsertTerritory(
          planningCtx,
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
        for (const unitId of matchedUnitIds) {
          const linkResult = await setUnitDivisions(planningCtx, unitId, [d.id], knownDivisionIds);
          if (linkResult.ok) linkedDivisions += 1;
        }
      }
    }
  }

  return {
    ok: true,
    units: orgResult.value.units,
    unplaced: orgResult.value.unplaced,
    detached: orgResult.value.detached,
    divisions,
    divisionsReplaced,
    territories,
    linkedUnits,
    linkedDivisions,
  };
}
