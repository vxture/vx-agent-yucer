import { test } from "node:test";
import assert from "node:assert/strict";
import { readRegistrationDraft, registrationFrame, similarRegistrations, REGISTRATION_DRAFT_FIELDS, type RegistrationDraftValues, type RegistrationVocab } from "./registration-draft";

const vocab: RegistrationVocab = {
  regions: [{ id: "region-east", name: "East" }], industries: [{ id: "retail", name: "Retail" }],
  segments: [{ id: "MID", name: "Mid market" }], customerTypes: [], customerSizes: [], customerNatures: [],
};
const answer = (fields: unknown[]) => JSON.stringify({ message: "Please review.", fields });

test("only supplied facts and workspace vocabulary enter the draft; unsupported facts and ids stay out", () => {
  const r = readRegistrationDraft(answer([
    { field: "name", value: "Acme", evidence: "Acme is a retailer" },
    { field: "industryId", value: "retail", evidence: "retailer" },
    { field: "region", value: "Other", evidence: "retailer" },
    { field: "segmentCode", value: "OTHER-WORKSPACE", evidence: "retailer" },
    { field: "creditCode", value: "91330000ABC", evidence: "retailer" },
    { field: "employeeCount", value: "200", evidence: "retailer" },
    { field: "website", value: "https://invented.example", evidence: "retailer" },
    { field: "ownerSub", value: "someone-else", evidence: "retailer" },
    { field: "parentId", value: "foreign", evidence: "retailer" },
  ]), "Acme is a retailer", vocab);
  assert.deepEqual(r?.patch, { name: "Acme", industryId: "retail" });
});

test("location canonicalization, numeric amounts and strategic tier require explicit supporting evidence", () => {
  const input = "Acme in \u6d59\u6c5f has 200 employees. \u6218\u7565\u7ea7\u5ba2\u6237\uff0c\u76ee\u6807 100\u4e07\u5143, visit every 30 days.";
  const r = readRegistrationDraft(answer([
    { field: "province", value: "\u6d59\u6c5f\u7701", evidence: "\u6d59\u6c5f" },
    { field: "employeeCount", value: "200", evidence: "200 employees" },
    { field: "targetAmount", value: "1000000", evidence: "100\u4e07\u5143" },
    { field: "tier", value: "strategic", evidence: "\u6218\u7565\u7ea7\u5ba2\u6237" },
    { field: "contactCadenceDays", value: "30", evidence: "30 days" },
    { field: "execCadenceDays", value: "90", evidence: "30 days" },
  ]), input, vocab);
  assert.deepEqual(r?.patch, { province: "\u6d59\u6c5f\u7701", employeeCount: "200", targetAmount: "1000000", tier: "strategic", contactCadenceDays: "30" });
  assert.deepEqual(readRegistrationDraft(answer([{ field: "tier", value: "strategic", evidence: "retailer" }]), "retailer", vocab)?.patch, {});
});

test("answers with no valid fields can ask a follow-up; malformed answers never mutate a draft", () => {
  assert.deepEqual(readRegistrationDraft(answer([]), "Please add a customer", vocab)?.patch, {});
  for (const raw of ["not JSON", "null", "[]", '{}', '{"message":"","fields":[]}']) assert.equal(readRegistrationDraft(raw, "text", vocab), null);
  assert.deepEqual(readRegistrationDraft(`\n\`\`\`json\n${answer([{ field: "name", value: "Acme", evidence: "Acme" }])}\n\`\`\``, "Acme", vocab)?.patch, { name: "Acme" });
});

test("confirmation frame asks for missing strategic targets without creating facts; current data is untrusted context", () => {
  const values = Object.fromEntries(REGISTRATION_DRAFT_FIELDS.map(key => [key, ""])) as RegistrationDraftValues;
  const frame = registrationFrame(vocab, { ...values, tier: "strategic" }, "zh-CN");
  assert.match(frame, /cannot save or create/);
  assert.match(frame, /target amount when missing/);
  assert.match(frame, /verbatim excerpt/);
  assert.match(frame, /untrusted data/);
  assert.match(frame, /Simplified Chinese/);
  assert.match(frame, /website = official homepage/);
  assert.match(frame, /not a substitute for public internet research/);
  assert.match(frame, /load_capability/);
});

test("important customer tier is accepted as key rather than silently dropped", () => {
  const text = "Acme \u91cd\u8981\u7ea7";
  assert.deepEqual(readRegistrationDraft(answer([{ field: "tier", value: "key", evidence: "\u91cd\u8981\u7ea7" }]), text, vocab)?.patch, { tier: "key" });
});

test("public research can fill an empty profile field with a cited read result, never a target", () => {
  const input = "\u5e2e\u6211\u67e5\u4e00\u4e0b Acme \u7684\u516c\u5f00\u8d44\u6599";
  const answerText = JSON.stringify({ message: "\u67e5\u5230\u5b98\u7f51\u548c\u884c\u4e1a\uff0c\u8bf7\u6838\u5bf9\u3002", fields: [
    { field: "name", value: "Acme", evidence: "Acme", sourceId: "read-1", sourceUrl: "https://acme.example" },
    { field: "website", value: "https://acme.example", evidence: "https://acme.example", sourceId: "read-1", sourceUrl: "https://acme.example" },
    { field: "targetAmount", value: "1000000", evidence: "\u6536\u5165\u89c4\u6a21", sourceId: "read-1" },
  ] });
  const r = readRegistrationDraft(answerText, input, vocab, { evidence: [{ id: "read-1", content: '{"name":"Acme","website":"https://acme.example"}' }] });
  assert.deepEqual(r?.patch, { name: "Acme", website: "https://acme.example" });
  assert.deepEqual(r?.sources, [
    { field: "name", excerpt: "Acme", url: "https://acme.example/" },
    { field: "website", excerpt: "https://acme.example", url: "https://acme.example/" },
  ]);
});

test("research cannot overwrite manual input, cite an invented result, or replace business decisions", () => {
  const rows = [
    { field: "website", value: "https://old.example", evidence: "https://old.example", sourceId: "read-1" },
    { field: "employeeCount", value: "200", evidence: "200", sourceId: "invented" },
    { field: "period", value: "2026Q4", evidence: "2026Q4", sourceId: "read-1" },
    { field: "targetAmount", value: "1000000", evidence: "1000000", sourceId: "read-1" },
    { field: "tier", value: "strategic", evidence: "strategic", sourceId: "read-1" },
  ];
  const result = readRegistrationDraft(answer(rows), "Look it up", vocab, {
    current: { website: "https://manual.example" },
    evidence: [{ id: "read-1", content: "https://old.example 200 2026Q4 1000000 strategic" }],
  });
  assert.deepEqual(result?.patch, {});
  assert.deepEqual(result?.sources, []);
});

test("previous user facts can fill gaps across turns without undoing a manual correction", () => {
  const rows = [
    { field: "name", value: "Acme", evidence: "Acme" },
    { field: "targetAmount", value: "1000000", evidence: "100\u4e07" },
  ];
  const context = { previousUserTexts: ["Acme, \u76ee\u6807100\u4e07"] };
  assert.deepEqual(readRegistrationDraft(answer(rows), "I already gave that", vocab, context)?.patch, { name: "Acme", targetAmount: "1000000" });
  assert.deepEqual(readRegistrationDraft(answer(rows), "I already gave that", vocab, { ...context, current: { name: "Manual", targetAmount: "2000000" } })?.patch, {});
});

test("duplicate hints normalize spacing and punctuation and do not treat one-letter fragments as company matches", () => {
  const rows = [{ id: "1", name: "Acme, Ltd", accountNo: "ACC-0001" }, { id: "2", name: "Other", accountNo: "ACC-0002" }];
  assert.deepEqual(similarRegistrations("acme ltd", rows), [rows[0]]);
  assert.deepEqual(similarRegistrations("a", rows), []);
  assert.deepEqual(similarRegistrations("", rows), []);
});
