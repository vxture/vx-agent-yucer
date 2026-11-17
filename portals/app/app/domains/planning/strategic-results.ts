import { getPrismaClient, prismaEnabled } from "../../lib/db";
import { demand } from "./plan-values";
import type { StrategyAcceptance } from "./strategy-handoff";
import type { PlanContent } from "./plan-model";
import { expectationWindow, uuid } from "../strategy/lib/expectations";

export interface StrategicResult {
  id: string; workspaceId: string; planId: string; revisionId: string; acceptanceKey: string;
  lineageId: string; objectiveId: string; allocationKey: string; regionId: string;
  achievedOn: string; evidenceUrl: string; note: string; actorSub: string; recordedAt: string; voidsId: string | null;
}
const memo = Symbol.for("yucer.strategic-results");
function memory(): StrategicResult[] {
  const g = globalThis as unknown as Record<symbol, StrategicResult[]>;
  return g[memo] ?? (g[memo] = []);
}
export async function listStrategicResults(workspaceId: string): Promise<StrategicResult[]> {
  if (!prismaEnabled()) return structuredClone(memory().filter(x => x.workspaceId === workspaceId));
  const rows = await (await getPrismaClient()).strategicResult.findMany({ where: { workspaceId }, orderBy: { recordedAt: "asc" } });
  return rows.map(x => ({ ...x, achievedOn: x.achievedOn.toISOString().slice(0,10), recordedAt:x.recordedAt.toISOString() }));
}
export function validateStrategicResult(row: StrategicResult, c: PlanContent, x: StrategyAcceptance, previous: readonly StrategicResult[]) {
  const a = x.allocations.find(a => a.key === row.allocationKey);
  const p = c.periods.find(p => p.key === a?.period);
  const w = expectationWindow(x.period, c.year);
  demand(uuid(row.id) && x.key === row.acceptanceKey && x.lineageId === row.lineageId && x.expectation.id === row.objectiveId && x.expectation.metric !== "revenue" &&
    a && a.regionId === row.regionId && p && w && /^\d{4}-\d{2}-\d{2}$/.test(row.achievedOn) && Number.isFinite(Date.parse(row.achievedOn)) &&
    new Date(row.achievedOn).toISOString().slice(0,10) === row.achievedOn && p.start <= row.achievedOn && row.achievedOn < p.end && w.start <= row.achievedOn && row.achievedOn <= w.end && row.achievedOn <= row.recordedAt.slice(0,10) &&
    typeof row.note === "string" && row.note.trim().length > 0 && row.note.length <= 2000 && row.evidenceUrl.length <= 2000, "strategy_result_invalid");
  let url: URL; try { url = new URL(row.evidenceUrl); } catch { demand(false, "strategy_result_invalid"); }
  demand(["https:", "http:"].includes(url.protocol) && !url.username && !url.password, "strategy_result_invalid");
  if (row.voidsId) {
    const old = previous.find(v => v.id === row.voidsId && v.voidsId === null);
    demand(old && old.workspaceId === row.workspaceId && old.lineageId === row.lineageId && old.objectiveId === row.objectiveId && old.allocationKey === row.allocationKey &&
      !previous.some(v => v.voidsId === old.id), "strategy_result_conflict");
  } else demand(!previous.some(v => v.lineageId === row.lineageId && v.objectiveId === row.objectiveId && v.evidenceUrl === row.evidenceUrl && !v.voidsId), "strategy_result_duplicate");
}
export async function appendStrategicResult(row: StrategicResult) {
  if (!prismaEnabled()) {
    const old = memory().find(x => x.id === row.id);
    if (old) { demand(JSON.stringify(old) === JSON.stringify(row), "strategy_result_conflict"); return; }
    demand(!memory().some(x => x.workspaceId === row.workspaceId && ((row.voidsId && x.voidsId === row.voidsId) || (!row.voidsId && !x.voidsId && x.lineageId === row.lineageId && x.objectiveId === row.objectiveId && x.evidenceUrl === row.evidenceUrl))), "strategy_result_duplicate");
    memory().push(structuredClone(row)); return;
  }
  await (await getPrismaClient()).strategicResult.create({ data:{ ...row, achievedOn:new Date(row.achievedOn),recordedAt:new Date(row.recordedAt) } });
}
