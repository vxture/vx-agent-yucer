import test from "node:test";
import assert from "node:assert/strict";
import { readSegmentDraft, segmentDraftFrame, segmentFillValues, type SegmentVocabulary } from "./segment-draft";
const vocab: SegmentVocabulary = { industries: ["Retail", "Manufacturing"], regions: ["East", "West"], sizes: ["Medium"],
  solutions: [{ id: "same", solutionCode: "SOL-1", name: "Retail suite", status: "active" }, { id: "s2", solutionCode: "SOL-2", name: "Legacy", status: "retired" }],
  products: [{ id: "same", productCode: "P1", name: "Store POS", status: "active" }, { id: "p2", productCode: "P2", name: "Inventory", status: "active" }] };
const blank = segmentFillValues("", { industries: [], regions: [] });

test("market draft applies all business fields and multiple distinct product/solution references", () => {
  const fields = { name: "Medium retail", industries: ["Retail"], regions: ["East", "West"], sizes: ["Medium"], customerNeed: "Stockouts", buyingScenario: "New stores", expectedOutcome: "Reduce reconciliation", entryBarrier: "ERP integration", productIds: ["same", "p2"], solutionIds: ["same"] };
  assert.deepEqual(readSegmentDraft(JSON.stringify({ fields }), vocab, blank)?.patch, fields);
});
test("unknown choices and invented IDs cannot replace a valid current selection", () => {
  const current = { ...blank, regions: ["East"], productIds: ["same"] };
  const result = readSegmentDraft(JSON.stringify({ fields: { regions: ["A department"], productIds: ["nonexistent"], solutionIds: ["s2"] } }), vocab, current)!;
  assert.deepEqual(result.patch, {}); assert.deepEqual(result.rejected, ["regions", "solutionIds", "productIds"]);
});
test("manual corrections, including intentional blanks, survive subsequent assistant turns", () => {
  const result = readSegmentDraft(JSON.stringify({ fields: { name: "AI name", customerNeed: "AI pain", industries: ["Retail"] }, clearFields: ["industries"] }), vocab, { ...blank, name: "Hand edited", industries: ["Manufacturing"] }, ["name", "customerNeed", "industries"]);
  assert.deepEqual(result?.patch, {});
});
test("empty placeholders do not clear drafts; explicit clearFields remove optional criteria and links", () => {
  const current = { ...blank, name: "Retail", industries: ["Retail"], solutionIds: ["same"] };
  assert.deepEqual(readSegmentDraft('{"fields":{"name":"","industries":[],"solutionIds":[]}}', vocab, current)?.patch, {});
  assert.deepEqual(readSegmentDraft('{"fields":{},"clearFields":["industries","solutionIds","name"]}', vocab, current)?.patch, { industries: [], solutionIds: [] });
});
test("existing legacy names remain usable without permitting newly invented values", () => {
  const current = { ...blank, regions: ["Legacy region"] };
  assert.deepEqual(readSegmentDraft('{"fields":{"regions":["Legacy region","East"]}}', vocab, current)?.patch.regions, ["Legacy region", "East"]);
});
test("prose claims and malformed structured outputs do not count as filling", () => {
  assert.equal(readSegmentDraft("Everything filled and saved!", vocab, blank), null);
  assert.equal(readSegmentDraft('{"fields":[]}', vocab, blank), null);
  assert.deepEqual(readSegmentDraft('{"fields":{"regions":"East","name":123}}', vocab, blank)?.patch, {});
  assert.equal(readSegmentDraft('```json\n{"fields":{"name":"Retail"}}\n```', vocab, blank)?.patch.name, "Retail");
});
test("framing supplies complete field meaning, configured choices, tools and draft-only semantics", () => {
  const frame = segmentDraftFrame(vocab, blank, ["customerNeed"], "en-US");
  for (const expected of ["Atlas/Runos", "SALES REGIONS", "same", "Retail", "Never save", "hypotheses", "Manual corrections", "clearFields"]) assert.ok(frame.includes(expected));
});
