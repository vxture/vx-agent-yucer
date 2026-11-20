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
  if (raw.fields.targets !== undefined) {
    if (!Array.isArray(raw.fields.targets) || raw.fields.targets.length > 4) return null;
    for (const row of raw.fields.targets) {
      if (!row || typeof row !== "object" || !["revenue", "new_logo", "pipeline", "margin"].includes(row.metric) ||
        typeof row.value !== "string" || patch.targets.some(t => t.metric === row.metric)) return null;
      try { if (row.metric === "new_logo" && minor(row.value) % 100n !== 0n) return null; minor(row.value); } catch { return null; }
      patch.targets.push({ metric: row.metric, value: row.value });
    }
  }
  for (const key of ["assumptions", "allocationNote", "capacityNote"] as const) {
    if (raw.fields[key] === undefined) continue;
    if (typeof raw.fields[key] !== "string" || raw.fields[key].length > 8000) return null;
    patch[key] = raw.fields[key];
  }
  // Unsupported UUID changes and claimed saves cannot masquerade as a patch.
  if (Object.keys(raw.fields).some(k => !["targets", "assumptions", "allocationNote", "capacityNote"].includes(k))) return null;
  return { patch, message: raw.message };
}
