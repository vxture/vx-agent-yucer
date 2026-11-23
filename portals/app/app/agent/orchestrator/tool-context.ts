import type { DiscoveryPage, InvokeResult, ResolvedCapability } from "../runos/types";
import { estimateTokens } from "./prompt";

// Discovery is an index, not a second copy of every registered contract.
// Exact IDs, operation risks and pagination remain available for lazy loading.
export function catalogContext(page: DiscoveryPage, compact = false) {
  const limit = compact ? 96 : 240;
  const brief = (value: string | undefined) => value && value.length > limit ? `${value.slice(0, limit)}...` : value;
  return {
    total: page.total,
    next_cursor: page.next_cursor,
    capabilities: page.capabilities.map(cap => ({
      capability_id: cap.capability_id, title: cap.title, primitive_type: cap.primitive_type,
      ...(compact ? { summary: brief(cap.summary || cap.use_when) } :
        { summary: brief(cap.summary), use_when: brief(cap.use_when), avoid_when: brief(cap.avoid_when) }),
      operations: cap.operations?.map(op => ({ operation: op.operation, risk_level: op.risk_level, interaction_mode: op.interaction_mode })),
    })),
  };
}

export function contractContext(cap: ResolvedCapability) {
  // Input schemas are already in loaded tool definitions. Output schemas and
  // deployment fields do not help the model choose its next tool.
  return {
    capability_id: cap.capability_id, title: cap.title, primitive_type: cap.primitive_type,
    state: cap.state, version: cap.version,
    summary: cap.contract.summary, use_when: cap.contract.useWhen, avoid_when: cap.contract.avoidWhen,
    dependencies: cap.contract.dependencies,
  };
}

function textOf(content: InvokeResult["content"]): string {
  return content.filter(c => c.type === "text" && c.text).map(c => c.text).join("\n");
}

export function referenceData(result: InvokeResult): unknown {
  const text = textOf(result.content);
  if (result.structured === undefined) return text;
  if (!text || text === JSON.stringify(result.structured)) return result.structured;
  // Runos mirrors MCP text-only reports as {content:[...]}. Keep that report
  // once, while genuinely different content and structured channels survive.
  const structured = result.structured as { content?: unknown } | null;
  if (structured && Array.isArray(structured.content) && text === textOf(structured.content)) return result.structured;
  return { structured: result.structured, text };
}

const REFERENCE_TOKENS = 2400;
export function referenceContext(data: unknown): { result: unknown; resultTruncated?: true; note?: string } {
  const content = typeof data === "string" ? data : JSON.stringify(data) ?? "";
  if (estimateTokens(content) <= REFERENCE_TOKENS) return { result: data };
  // Bound reference text, never rules, schemas, tool-call IDs or sourceIds.
  // Keep valid JSON and distinguish an excerpt from a complete page review.
  let low = 0, high = content.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimateTokens(content.slice(0, mid)) <= REFERENCE_TOKENS) low = mid;
    else high = mid - 1;
  }
  return {
    result: { excerpt: content.slice(0, low), originalCharacters: content.length },
    resultTruncated: true,
    note: "Untrusted reference excerpt only; the rest was omitted from model context. Do not infer absence or claim a full-page review. Request a narrower read if needed.",
  };
}
