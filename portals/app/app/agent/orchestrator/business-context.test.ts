import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMessage } from "../atlas/types";
import { BusinessReadContext } from "./business-context";
import { estimateTokens } from "./prompt";
function receipt(page: number) {
  const records = Array.from({ length: 10 }, (_, i) => ({
    source: { kind: "segment", id: `${page}-${i}`, version: "original-full-record-v1" },
    record: { name: "Current market", amount: 1234.56, status: "active", criteria: { customerNeed: "Long authorized text ".repeat(250) } },
    truncatedPaths: [], availableFields: ["name", "amount", "status", "criteria"], arrayLengths: {},
  }));
  return { records, sources: records.map(r => r.source), matchedCount: 40, returnedCount: 10, offset: page * 10, nextOffset: (page + 1) * 10,
    recordState: "Draft statuses are not published facts.", detail: false };
}
test("rolling query context keeps protocol envelopes, source versions, exact scalars and explicit excerpt markers", () => {
  const context = new BusinessReadContext(), data = receipt(0);
  const reasoning = { text: "Opaque continuation", signature: "unchanged" };
  const messages: ChatMessage[] = [{ role: "assistant", content: "Observations", reasoning, toolCalls: [{ id: "read", name: "query_business", arguments: { kind: "segment" } }] },
    { role: "tool", toolCallId: "read", name: "query_business", content: JSON.stringify(data) }];
  assert.equal(context.record(1, { kind: "segment" }, data), true);
  context.fit(messages, 1800);
  assert.ok(context.tokens(messages) <= 1800);
  assert.equal(messages[0]!.reasoning, reasoning);
  assert.equal(messages[1]!.toolCallId, "read");assert.equal(messages[1]!.name, "query_business");
  const view = JSON.parse(messages[1]!.content);
  assert.equal(view.matchedCount, 40);assert.equal(view.nextOffset, 10);
  assert.equal(view.contextSummary, true);
  assert.equal(view.recordState, data.recordState);assert.equal(view.detail, false);
  assert.ok(view.records.every((row: { source: { version: string } }) => row.source.version === "original-full-record-v1"));
  if (!view.recordBodiesOmitted) {
    assert.equal(view.records[0].record.amount, 1234.56);
    assert.ok(view.records[0].contextOmittedPaths.includes("criteria.customerNeed"));
  }
  assert.equal(data.records[0]!.record.criteria.customerNeed.length, 5250);
});
test("multiple query pages fit a shared rolling budget and the newest page is retained when older ones must be omitted", () => {
  const context = new BusinessReadContext(), messages: ChatMessage[] = [];
  for (let i = 0; i < 14; i++) {
    const data = receipt(i);
    context.record(messages.length, { kind: "segment", offset: i * 10 }, data);
    messages.push({ role: "tool", toolCallId: String(i), name: "query_business", content: JSON.stringify(data) });
  }
  context.fit(messages, 6000);
  assert.ok(context.tokens(messages) <= 6000);
  const oldest = JSON.parse(messages[0]!.content), latest = JSON.parse(messages.at(-1)!.content);
  assert.equal(oldest.contextSummary, true);
  assert.equal(oldest.nextOffset, 10);
  assert.ok(latest.records.length);
  assert.equal(messages.length, 14);
  assert.ok(messages.every(m => estimateTokens(m.content) < 6000));
});
test("malformed receipts and unrelated private form content are never rewritten", () => {
  const context = new BusinessReadContext();
  assert.equal(context.record(0, {}, { ok: false, error: "source_unavailable" }), false);
  assert.equal(context.record(0, {}, { records: [null] }), false);
  assert.equal(context.record(0, {}, { records: [{}] }), false);
  assert.equal(context.record(0, {}, { ok: false, records: [] }), false);
  const messages: ChatMessage[] = [{ role: "tool", toolCallId: "form", name: "prepare_business_form", content: "Human-edited draft" }];
  context.fit(messages, 1);assert.equal(messages[0]!.content, "Human-edited draft");
});
