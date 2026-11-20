import test from "node:test";
import assert from "node:assert/strict";
import { readCatalogDraft, catalogDraftFrame, type CatalogDraftVocabulary } from "./catalog-draft";
const vocab: CatalogDraftVocabulary = {
  types: [{ id: "type", name: "Software", parentId: null, status: "active" }, { id: "retired", name: "Old", parentId: null, status: "retired" }],
  units: [{ id: "seat", name: "User" }], products: [{ id: "p1", name: "ERP", productCode: "ERP-1", unitId: "seat" }, { id: "p2", name: "Service", productCode: "SVC-1", unitId: "seat" }],
};
const current = { name: "", novelty: null };
const read = (fields: unknown, kind: "product" | "solution" = "product") => readCatalogDraft(JSON.stringify({ fields }), kind, vocab, current)!;
test("product draft maps configured UUIDs and excludes number, price and status writes", () => {
  assert.deepEqual(read({ name: "ERP", typeId: "type", unitId: "seat", novelty: "new", productCode: "changed", statusId: "retired", listPrice: 0 }).patch,
    { name: "ERP", typeId: "type", unitId: "seat", novelty: "new" });
  assert.deepEqual(read({ typeId: "foreign", unitId: "made-up" }).rejected, ["typeId", "unitId"]);
});
test("unknown/retired types cannot be added, current retired references can be retained", () => {
  assert.deepEqual(read({ typeId: "retired" }).patch, {});
  assert.equal(readCatalogDraft('{"fields":{"typeId":"retired"}}', "product", vocab, { ...current, typeId: "retired" })?.rejected.length, 0);
});
test("manual edits including blanks survive model patches and explicit clear requests", () => {
  const result = readCatalogDraft('{"fields":{"name":"Changed","summary":"Changed"},"clearFields":["summary","novelty"]}', "solution", vocab,
    { name: "Manual", novelty: "existing", summary: "" }, ["name", "summary", "novelty"]);
  assert.deepEqual(result?.patch, {});
});
test("placeholder blanks retain values; explicit allowed clearing is separate", () => {
  const fields = { name: "", typeId: "", novelty: null };
  assert.deepEqual(read(fields).patch, {});
  assert.deepEqual(readCatalogDraft('{"fields":{},"clearFields":["name","unitId","typeId","novelty"]}', "product", vocab, current)?.patch, { typeId: "" });
});
test("solution drafts carry multi-product UUIDs, quantities, options and notes", () => {
  const items = [{ productId: "p1", quantity: 2.5, optional: false }, { productId: "p2", quantity: 1, optional: true, note: " Add-on " }];
  assert.deepEqual(read({ name: "Retail ERP", summary: "Value", scenario: "Retail", items }, "solution").patch.items,
    [{ ...items[0], note: "" }, { ...items[1], note: "Add-on" }]);
});
test("bad composition never partially replaces a valid bundle", () => {
  for (const items of [null, [{ productId: "foreign", quantity: 1, optional: false }], [{ productId: "p1", quantity: 0, optional: false }],
    [{ productId: "p1", quantity: "2", optional: false }], [{ productId: "p1", quantity: 1, optional: true }],
    [{ productId: "p1", quantity: 1, optional: false }, { productId: "p1", quantity: 2, optional: false }]]) {
    assert.deepEqual(read({ items }, "solution").rejected, ["items"]);
    assert.deepEqual(read({ items }, "solution").patch, {});
  }
});
test("prose or malformed JSON is not mistaken for completed filling", () => {
  for (const reply of ["I filled the form", "{}", '{"fields":[]}', "null"]) assert.equal(readCatalogDraft(reply, "product", vocab, current), null);
  assert.equal(readCatalogDraft('```json\n{"fields":{"name":"ERP"}}\n```', "product", vocab, current)?.patch.name, "ERP");
});
test("frame states manual review, public/internal sources and actual allowed catalog identities", () => {
  const frame = catalogDraftFrame("solution", vocab, current, ["name"], "zh-CN");
  assert.match(frame, /existing Atlas\/Runos/); assert.match(frame, /not public internet/);
  assert.match(frame, /only persistence action/); assert.match(frame, /ERP-1/);
});
