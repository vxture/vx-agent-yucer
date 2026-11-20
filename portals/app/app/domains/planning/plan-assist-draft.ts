import type { PlanContent } from "./plan-model";
import { minor } from "./plan-values";
import { readAssistantFields } from "../shared/assistant-fields";
export type PlanningDraftPatch = {
  targets: { metric: "revenue" | "new_logo" | "pipeline" | "margin"; value: string }[];
  assumptions?: string; allocationNote?: string; capacityNote?: string;
};
export type PlanningDraftContext = { year: number; revisionId: string; editToken: number; regionId?: string };
export function planningDraftScope(content: PlanContent, regionId?: string) {
  if (content.releaseScope === "company") return regionId ? null : "workspace";
  return regionId && content.regions.some(r => r.id === regionId && r.included) ? `territory:${regionId}` : null;
}
export function readPlanningDraft(answer: string) {
  const raw = readAssistantFields(answer);
  if (!raw) return null;
  const patch: PlanningDraftPatch = { targets: [] };
  const targets = readTargets(raw.fields.targets);
  if (!targets) return null;
  patch.targets = targets;
  for (const key of ["assumptions", "allocationNote", "capacityNote"] as const) {
    if (raw.fields[key] === undefined) continue;
    if (typeof raw.fields[key] !== "string" || raw.fields[key].length > 8000) return null;
    patch[key] = raw.fields[key];
  }
  // Unsupported UUID changes and claimed saves cannot masquerade as a patch.
  if (Object.keys(raw.fields).some(k => !["targets", "assumptions", "allocationNote", "capacityNote"].includes(k))) return null;
  return { patch, message: raw.message };
}

function readTargets(value: unknown): PlanningDraftPatch["targets"] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) return null;
  const targets: PlanningDraftPatch["targets"] = [];
  for (const row of value) {
    if (!validTarget(row) || targets.some(t => t.metric === row.metric)) return null;
    targets.push({ metric: row.metric, value: row.value });
  }
  return targets;
}
function validTarget(row: unknown): row is PlanningDraftPatch["targets"][number] {
  if (!row || typeof row !== "object" || !("metric" in row) || !("value" in row)) return false;
  if (typeof row.metric !== "string" || !["revenue", "new_logo", "pipeline", "margin"].includes(row.metric) || typeof row.value !== "string") return false;
  try {
    const value = minor(row.value);
    return row.metric !== "new_logo" || value % 100n === 0n;
  } catch { return false; }
}
