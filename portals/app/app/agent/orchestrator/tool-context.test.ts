import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiscoveredCapability, ResolvedCapability } from "../runos/types";
import { estimateTokens } from "./prompt";
import { catalogContext, contractContext, referenceContext, referenceData } from "./tool-context";

test("Runos MCP content mirrors do not double a report, but distinct channels remain", () => {
  const content = [{ type: "text", text: "Official source: https://example.org/report" }];
  const structured = { content, _meta: { searchTime: 3 } };
  assert.equal(referenceData({ content, structured, meta: {} }), structured);
  assert.deepEqual(referenceData({ content, structured: { status: "success" }, meta: {} }), { structured: { status: "success" }, text: content[0]!.text });
  assert.equal(referenceData({ content, meta: {} }), content[0]!.text);
  assert.equal(referenceData({ content: [{ type: "text", text: JSON.stringify(structured) }], structured, meta: {} }), structured);
});

test("long multilingual reports are marked excerpts without changing the original receipt", () => {
  const data = { url: "https://example.org/report", text: "\u8d44\u6599".repeat(40000) };
  const receipt = JSON.stringify(data);
  const context = referenceContext(data);
  assert.equal(context.resultTruncated, true);
  assert.match(context.note!, /Do not infer absence or claim a full-page review/);
  const excerpt = context.result as { excerpt: string; originalCharacters: number };
  assert.equal(excerpt.originalCharacters, receipt.length);
  assert.ok(estimateTokens(excerpt.excerpt) <= 2400);
  assert.match(excerpt.excerpt, /https:\/\/example.org\/report/);
  assert.equal(JSON.stringify(data), receipt);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(context)));
  assert.deepEqual(referenceContext({ text: "short" }), { result: { text: "short" } });
});

test("catalog excerpts keep exact IDs, risks and opaque pagination without bulky metadata", () => {
  const cap = { capability_id: "public.search", title: "Search", primitive_type: "connector", summary: "x".repeat(10000), availability: { large: "y".repeat(10000) }, operations: [{ operation: "search", description: "z".repeat(10000), risk_level: "read", interaction_mode: "sync" }] } as unknown as DiscoveredCapability;
  const result = catalogContext({ capabilities: [cap], total: 877, next_cursor: "opaque-cursor" });
  assert.equal(result.next_cursor, "opaque-cursor");
  assert.equal(result.total, 877);
  assert.equal(result.capabilities[0]!.capability_id, "public.search");
  assert.equal(result.capabilities[0]!.operations[0]!.risk_level, "read");
  assert.ok(JSON.stringify(result).length < 600);
});

test("contract summaries keep version and dependencies while schemas stay in tool definitions", () => {
  const cap = { capability_id: "company.research", title: "Research", version: "1.2.3", state: "stable", contract: { summary: "Search", dependencies: ["public.search"], operations: [{ inputSchema: { long: "x".repeat(10000) }, outputSchema: { long: "y".repeat(10000) } }] } } as unknown as ResolvedCapability;
  const result = contractContext(cap);
  assert.equal(result.version, "1.2.3");
  assert.deepEqual(result.dependencies, ["public.search"]);
  assert.ok(JSON.stringify(result).length < 300);
});
