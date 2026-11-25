import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { estimateTokens } from "../../../agent/orchestrator/prompt";
import { businessQueryPage, BUSINESS_QUERY_TOKENS, validBusinessField } from "./business-query";
import type { TaskObject, TaskSource } from "./task-contract";
const access: TaskSource = { kind: "access", id: randomUUID(), version: "access-v1" };
const source = async (o: TaskObject): Promise<TaskSource> => ({ ...o, version: "full-record-v1" });
function markets(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const id = `00000000-0000-4000-a000-${String(i).padStart(12, "0")}`;
    return { object: { kind: "segment" as const, id }, data: { id, name: "Market " + i, status: "active",
      criteria: { needSummary: "Use the platform", customerNeed: "Detailed requirement ".repeat(500), buyingScenario: "Procurement ".repeat(500) },
      solutionIds: Array.from({ length: 30 }, () => randomUUID()),
    } };
  });
}
test("long native market pages fit model context and remain pageable without losing source versions", async () => {
  const rows = markets(43), found = new Set<string>();
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await businessQueryPage(rows, { offset }, access, source);
    assert.ok(estimateTokens(JSON.stringify(page)) <= BUSINESS_QUERY_TOKENS);
    assert.equal(page.matchedCount, 43);
    assert.ok(page.returnedCount > 0);
    for (const row of page.records) {
      assert.ok(!found.has(row.source.id)); found.add(row.source.id);
      assert.equal(row.source.version, "full-record-v1");
      assert.ok(row.truncatedPaths.length > 0);
      assert.equal(row.arrayLengths.solutionIds, 30);
    }
    assert.equal(page.sources.length, page.records.length + 1);
    offset = page.nextOffset;
  }
  assert.equal(found.size, 43);
});
test("filter counts and pagination apply after authorized matches, not the unfiltered collection", async () => {
  const rows = markets(25);
  const page = await businessQueryPage(rows, { query: "Market 24" }, access, source);
  assert.equal(page.matchedCount, 1); assert.equal(page.nextOffset, null); assert.equal(page.limited, false);
  const empty = await businessQueryPage(rows, { query: "absent" }, access, source);
  assert.equal(empty.returnedCount, 0); assert.deepEqual(empty.sources, [access]);
});
test("an exact field read returns the original relevant text while unrelated revision history stays out", async () => {
  const row = markets(1)[0]!;
  row.data.criteria.customerNeed = "A precise current requirement.";
  const result = await businessQueryPage([row], { id: row.object.id, fields: ["criteria.customerNeed"] }, access, source);
  assert.equal(result.detail, true);
  assert.deepEqual(result.records[0]!.record, { "criteria.customerNeed": "A precise current requirement." });
  assert.deepEqual(result.records[0]!.truncatedPaths, []);
});
test("large versioned plans expose field and array navigation with valid JSON instead of serializing every revision", async () => {
  const id = randomUUID();
  const data = { id, year: 2026, revisions: Array.from({ length: 60 }, (_, index) => ({
    id: randomUUID(), state: "sealed", content: { targets: [{ metric: "revenue", value: index }] }, history: "Private old draft ".repeat(10000),
  })) };
  const rows = [{ object: { kind: "sales_plan" as const, id }, data }];
  const list = await businessQueryPage(rows, {}, access, source);
  assert.ok(!JSON.stringify(list).includes("Private old draft"));
  assert.equal(list.records[0]!.arrayLengths.revisions, 60);
  const detail = await businessQueryPage(rows, { id }, access, source);
  assert.ok(estimateTokens(JSON.stringify(detail)) <= BUSINESS_QUERY_TOKENS);
  assert.ok(detail.records[0]!.truncatedPaths.length);
  const exact = await businessQueryPage(rows, { id, fields: ["revisions.59.content.targets"] }, access, source);
  assert.deepEqual(exact.records[0]!.record, { "revisions.59.content.targets": [{ metric: "revenue", value: 59 }] });
});
test("structured scalar values and timestamps remain exact, sources failing after list still refuse", async () => {
  const id = randomUUID(), data = { id, amount: { amount: 12345.67, currency: "CNY" }, updatedAt: new Date("2026-11-24T12:00:00Z"), active: false };
  const rows = [{ object: { kind: "opportunity" as const, id }, data }];
  const result = await businessQueryPage(rows, { id }, access, source);
  assert.deepEqual(result.records[0]!.record, { ...data, updatedAt: data.updatedAt.toISOString() });
  await assert.rejects(businessQueryPage(rows, {}, access, async () => null), /source_unavailable/);
});
test("field paths reject prototype access and arbitrary expressions", () => {
  for (const path of ["criteria.customerNeed", "revisions.3.content.targets.0", "name"]) assert.equal(validBusinessField(path), true);
  for (const path of ["__proto__.x", "x.constructor.name", "x.prototype", "revisions[-1]", "x.*", "x.01", "x;select", "x.".repeat(100)]) assert.equal(validBusinessField(path), false);
});
test("a long individual text field can be read to the end through bounded explicit text pages", async () => {
  const row = markets(1)[0]!;
  row.data.criteria.customerNeed = "\u5e02\u573a\u53d8\u5316\u4e0e\u73b0\u6709\u673a\u4f1a. ".repeat(1500);
  let textOffset: number | null = 0, full = "";
  while (textOffset !== null) {
    const page = await businessQueryPage([row], { id: row.object.id, fields: ["criteria.customerNeed"], textOffset }, access, source);
    assert.ok(estimateTokens(JSON.stringify(page)) <= BUSINESS_QUERY_TOKENS);
    const record = page.records[0]!;
    assert.equal(record.textPage!.offset, textOffset);
    assert.equal(record.textPage!.totalLength, row.data.criteria.customerNeed.length);
    assert.equal(record.source.version, "full-record-v1");
    full += (record.record as Record<string, string>)["criteria.customerNeed"];
    const next = record.textPage!.nextOffset;
    assert.ok(next === null || next > textOffset);
    textOffset = next;
  }
  assert.equal(full, row.data.criteria.customerNeed);
  await assert.rejects(businessQueryPage([row], { id: row.object.id, fields: ["criteria"], textOffset: 0 }, access, source), /business_query_denied/);
});
