import type { BudgetReason, BudgetUsage, TurnResult } from "../../../agent/orchestrator/turn";
import type { ModelUsage } from "../../../agent/orchestrator/turn-budget";
import { validFailureCode, validFailureDiagnostic, type TaskFailureDiagnostic } from "./task-failure";

const MAX_MODEL_USAGE_ROWS = 20;
const MODEL_USAGE_FIELDS = ["promptTokens", "completionTokens", "totalTokens", "messageTokens", "schemaTokens", "toolResultTokens"] as const;

export interface ResearchSource {
  id: string;
  capabilityId: string | null;
  operation: string | null;
  callId: string | null;
  version: string | null;
  excerpt: string;
  links: string[];
}
export interface TaskArtifacts {
  version: "task-artifacts/1";
  capturedAt: string;
  research: ResearchSource[];
  usage: { elapsedMs: number; totalTokens: number; toolRounds: number; truncated: boolean; modelUsage?: ModelUsage[] };
  calls: Array<{ capabilityId: string; operation: string; callId: string | null; version: string | null; ok: boolean }>;
  failure?: { reason: BudgetReason; modelRequests: number; toolCalls: number };
  diagnostic?: TaskFailureDiagnostic;
}

function perModelUsage(rows: ModelUsage[] | undefined): { modelUsage?: ModelUsage[] } {
  // List the numeric fields explicitly so a future caller cannot persist
  // request payloads alongside metering data by extending the trace.
  return rows?.length ? { modelUsage: rows.slice(0, MAX_MODEL_USAGE_ROWS).map((row) => ({
    promptTokens: row.promptTokens, completionTokens: row.completionTokens, totalTokens: row.totalTokens,
    messageTokens: row.messageTokens, schemaTokens: row.schemaTokens, toolResultTokens: row.toolResultTokens,
  })) } : {};
}

/** Counts only: a failed or revoked turn must not deliver partial private
 * content, tool arguments, sources, forms or an unverified model answer. */
export function budgetFailureArtifacts(usage: BudgetUsage): TaskArtifacts {
  return {
    version: "task-artifacts/1", capturedAt: new Date().toISOString(), research: [], calls: [],
    usage: { elapsedMs: usage.elapsedMs, totalTokens: usage.totalTokens, toolRounds: usage.toolRounds, truncated: true, ...perModelUsage(usage.modelUsage) },
    failure: { reason: usage.reason, modelRequests: usage.modelRequests, toolCalls: usage.toolCalls },
  };
}
export function turnFailureArtifacts(usage: { totalTokens: number; toolRounds: number; modelUsage?: ModelUsage[] }, startedAt: number, diagnostic: TaskFailureDiagnostic): TaskArtifacts {
  const safe: TaskFailureDiagnostic = { stage: diagnostic.stage, category: diagnostic.category,
    ...(diagnostic.code !== undefined ? { code: validFailureCode(diagnostic.code) ? diagnostic.code : "OTHER" } : {}),
    modelFinished: diagnostic.modelFinished, sourceCount: diagnostic.sourceCount, formCount: diagnostic.formCount,
    modelRequests: diagnostic.modelRequests, toolCalls: diagnostic.toolCalls };
  return { version: "task-artifacts/1", capturedAt: new Date().toISOString(), research: [], calls: [], diagnostic: safe,
    usage: { elapsedMs: Math.max(0, Date.now()-startedAt), totalTokens: usage.totalTokens, toolRounds: usage.toolRounds, truncated: true, ...perModelUsage(usage.modelUsage) } };
}
export function publicSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) return null;
    for (const key of url.searchParams.keys()) if (/(?:token|secret|password|signature|api.?key|authorization)/i.test(key)) return null;
    return url.href.length <= 2000 ? url.href : null;
  } catch { return null; }
}
function links(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(/https?:\/\/[^\s<>"\\]+/gi)) {
    let end = match[0].length;
    while (end > 0 && "),.;".includes(match[0][end - 1]!)) end--;
    const url = publicSourceUrl(match[0].slice(0, end));
    if (url) found.add(url);
    if (found.size === 8) break;
  }
  return [...found];
}
/** Private, bounded provenance from successful tool receipts only. No model
 * text becomes evidence; the task's full source/permission closure guards replay. */
export function taskArtifacts(result: TurnResult, startedAt: number): TaskArtifacts {
  const tag = (v: string | undefined): string | null => v?.slice(0, 256) ?? null;
  const artifacts: TaskArtifacts = {
    version: "task-artifacts/1", capturedAt: new Date().toISOString(),
    research: result.readEvidence.slice(0, 20).map(e => ({
      id: e.id.slice(0, 256), capabilityId: tag(e.capabilityId), operation: tag(e.operation),
      callId: tag(e.callId), version: tag(e.versionResolved),
      excerpt: e.content.replace(/https?:\/\/[^\s<>"\\]+/gi, url => publicSourceUrl(url) ?? "[link omitted]").slice(0, 1500), links: links(e.content),
    })),
    usage: { elapsedMs: Math.max(0, Date.now()-startedAt), totalTokens: result.totalTokens, toolRounds: result.toolRounds, truncated: result.truncated, ...perModelUsage(result.modelUsage) },
    calls: result.invocations.slice(0, 64).map(c => ({capabilityId:c.capabilityId.slice(0,256),operation:c.operation.slice(0,256),callId:tag(c.callId),version:tag(c.versionResolved),ok:c.ok})),
  };
  // UTF-8 excerpts and many long URLs can exceed the SQL byte ceiling even
  // when every individual field is bounded. Leave room for JSONB spacing.
  const size = () => new TextEncoder().encode(JSON.stringify(artifacts)).length;
  while(size()>110000 && artifacts.research.length) artifacts.research.pop();
  while(size()>110000 && artifacts.calls.length) artifacts.calls.pop();
  return artifacts;
}
export function readTaskArtifacts(value: unknown): TaskArtifacts | undefined {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== "task-artifacts/1") return undefined;
  const v=value as TaskArtifacts;
  const str=(s:unknown):s is string=>typeof s==="string";
  const tag=(s:unknown)=>s===null || (str(s)&&s.length<=256);
  const count=(n:unknown)=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
  if(!str(v.capturedAt)||!Number.isFinite(Date.parse(v.capturedAt))||!v.usage||
    !count(v.usage.elapsedMs)||!count(v.usage.totalTokens)||!count(v.usage.toolRounds)||typeof v.usage.truncated!=="boolean"||
    (v.usage.modelUsage !== undefined && (!Array.isArray(v.usage.modelUsage) || v.usage.modelUsage.length > MAX_MODEL_USAGE_ROWS ||
      !v.usage.modelUsage.every(row => row && Object.keys(row).length === MODEL_USAGE_FIELDS.length &&
        MODEL_USAGE_FIELDS.every(k => Number.isSafeInteger(row[k]) && row[k] >= 0)))) ||
    !Array.isArray(v.research)||v.research.length>20||!Array.isArray(v.calls)||v.calls.length>64||
    (v.failure && (!["tokens","deadline","tool_calls"].includes(v.failure.reason)||!count(v.failure.modelRequests)||!count(v.failure.toolCalls)||v.research.length!==0||v.calls.length!==0))||
    (v.diagnostic && (!validFailureDiagnostic(v.diagnostic)||v.research.length!==0||v.calls.length!==0))||
    !v.research.every(s=>s&&str(s.id)&&tag(s.capabilityId)&&tag(s.operation)&&tag(s.callId)&&tag(s.version)&&str(s.excerpt)&&s.excerpt.length<=1500&&Array.isArray(s.links)&&s.links.length<=8&&s.links.every(l=>str(l)&&publicSourceUrl(l)===l))||
    !v.calls.every(c=>c&&str(c.capabilityId)&&str(c.operation)&&tag(c.callId)&&tag(c.version)&&typeof c.ok==="boolean"))return undefined;
  return v;
}
