import type { ChatMessage, ToolDefinition } from "../atlas/types";
import { estimateTokens } from "./prompt";
import { measureTurnInput } from "./turn-budget";

interface Receipt { query: Record<string, unknown>; result: Record<string, unknown> }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
function excerpt(value: unknown, path: string, omitted: Set<string>, depth = 0): unknown {
  if (typeof value === "string" && value.length > 96) { omitted.add(path); return value.slice(0, 96); }
  if (!value || typeof value !== "object") return value;
  if (depth >= 3) { omitted.add(path); return { omittedFromContext: true }; }
  if (Array.isArray(value)) {
    if (value.length > 2) omitted.add(path);
    return value.slice(0, 2).map((v, i) => excerpt(v, `${path}.${i}`, omitted, depth + 1));
  }
  const entries = Object.entries(value).filter(([k]) => !UNSAFE.has(k));
  if (entries.length > 12) omitted.add(path);
  return Object.fromEntries(entries.slice(0, 12).map(([k, v]) => [k, excerpt(v, path ? `${path}.${k}` : k, omitted, depth + 1)]));
}
function compact(receipt: Receipt, indexOnly: boolean) {
  const { result, query } = receipt;
  const records = (result.records as Record<string, unknown>[]).map(row => {
    const omitted = new Set<string>();
    return indexOnly ? { source: row.source } : {
      source: row.source, record: excerpt(row.record, "", omitted),
      truncatedPaths: row.truncatedPaths, contextOmittedPaths: [...omitted],
      availableFields: row.availableFields, arrayLengths: row.arrayLengths, textPage: row.textPage,
    };
  });
  return {
    query, records, matchedCount: result.matchedCount, returnedCount: result.returnedCount,
    offset: result.offset, nextOffset: result.nextOffset, limited: result.limited,
    recordState: result.recordState, detail: result.detail,
    contextSummary: true, ...(indexOnly ? { recordBodiesOmitted: true } : {}),
    note: "Earlier authorized query, compacted in active context; not a complete record or population. Source versions remain bound to full records by the server. Do not infer missing facts or totals from excerpts. Reissue query with id/fields for necessary details; nextOffset is record pagination, textPage.nextOffset is textOffset for a string field.",
  };
}

/** Per-turn scratch space only. Raw records stay private and are never persisted
 * as memory or granted new authority. Protocol IDs and assistant envelopes stay intact. */
export class BusinessReadContext {
  private readonly receipts = new Map<number, Receipt>();
  private finalizingReads = false;
  private completingForms = false;
  record(index: number, query: Record<string, unknown>, result: unknown): boolean {
    if (!object(result) || result.ok === false || !Array.isArray(result.records) ||
      !result.records.every(row => object(row) && object(row.source) && Object.hasOwn(row, "record"))) return false;
    this.receipts.set(index, { query, result });
    return true;
  }
  get size() { return this.receipts.size; }
  get finalizing() { return this.finalizingReads; }
  get completing() { return this.completingForms; }
  tokens(messages: readonly ChatMessage[]) {
    return [...this.receipts.keys()].reduce((n, i) => n + estimateTokens(messages[i]!.content), 0);
  }
  prepare(messages: ChatMessage[], tools: ToolDefinition[] | undefined, remaining: number, outputTokens: number, completionTool?: ToolDefinition) {
    if (!this.size && !completionTool) return tools;
    const before = measureTurnInput(messages, tools);
    const fixed = before.messageTokens - this.tokens(messages) + before.schemaTokens;
    const allowance = Math.min(6000, Math.max(512, Math.floor((remaining - fixed - outputTokens) / 2)));
    this.fit(messages, allowance);
    const measured = measureTurnInput(messages, tools);
    // A complete answer needs room after a possible additional read round.
    // Reserve it before another request can consume the original turn budget.
    if (!this.finalizingReads && tools?.length && remaining < 2 * (measured.messageTokens + measured.schemaTokens + outputTokens)) {
      this.finalizingReads = true;
      const completion = completionTool ? [completionTool] : undefined;
      const size = measureTurnInput(messages, completion);
      // A private form needs one bounded call, not another discovery/research
      // cycle. Its verified result supplies the final status without spending
      // an additional model request just to acknowledge the form.
      this.completingForms = !!completion && remaining > size.messageTokens + size.schemaTokens + outputTokens + 512;
      messages.push({ role: "user", content: this.completing
        ? "Research is now closed within the original turn budget. If the user requested native forms, use the one remaining prepare_business_form batch for modules whose contracts you already read, using verified facts and authorized options only. Leave unknown or conflicting fields unset. Do not research, query, navigate, request execution or write business records. Include a brief useful explanation in this reply; the server will report the actual preparation result. If no form is warranted, give the grounded answer instead. Explicitly state missing details; do not ask the person to restart the task."
        : "The remaining read budget is now reserved for your answer. Make no further tool calls. Give a useful analysis grounded in the verified records currently available. Explicitly state any unread pages or missing details and distinguish observations, hypotheses and recommendations. Do not claim a complete review, a business save or a publication without evidence." });
    }
    if (!this.finalizingReads) return tools;
    return this.completing && completionTool ? [completionTool] : undefined;
  }
  private replace(messages: ChatMessage[], index: number, value: unknown) {
    const content = JSON.stringify(value);
    if (estimateTokens(content) < estimateTokens(messages[index]!.content)) messages[index] = { ...messages[index]!, content };
  }
  fit(messages: ChatMessage[], maxTokens: number) {
    const size = () => this.tokens(messages);
    // First remove duplicate transport-only sources. The domain service already
    // bound them; each returned record retains its own exact source/version.
    for (const [i, { result }] of this.receipts) {
      const { sources: _sources, ...reference } = result;
      if (messages[i]!.content === JSON.stringify(result)) messages[i] = { ...messages[i]!, content: JSON.stringify(reference) };
    }
    for (const indexOnly of [false, true]) {
      for (const [i, receipt] of this.receipts) {
        if (size() <= maxTokens) return;
        this.replace(messages, i, compact(receipt, indexOnly));
      }
    }
    // Many earlier pages can make even a source index too large. Keep the
    // exact repeatable query and counts, explicitly omit the bodies and refs.
    // Their source authorization and versions are still enforced server-side.
    for (const [i, { query, result }] of this.receipts) {
      if (size() <= maxTokens) return;
      this.replace(messages, i, { query, matchedCount: result.matchedCount, returnedCount: result.returnedCount,
        offset: result.offset, nextOffset: result.nextOffset, limited: result.limited, recordState: result.recordState, detail: result.detail,
        contextSummary: true, recordBodiesOmitted: true, sourceIndexOmitted: true,
        note: "Earlier page omitted from active context. Do not infer record facts or totals. Reissue this query with id/fields for required details. Original source versions and access remain enforced by the server." });
    }
  }
}
