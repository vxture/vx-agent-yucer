import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationAnswerReviewer, previousRegistrationEvidence } from "./registration-feedback";
import { REGISTRATION_DRAFT_FIELDS, type RegistrationDraftValues, type RegistrationVocab } from "./registration-draft";
const current = Object.fromEntries(REGISTRATION_DRAFT_FIELDS.map(key => [key, ""])) as RegistrationDraftValues;
const vocab: RegistrationVocab = { regions: [], industries: [], segments: [], customerTypes: [], customerSizes: [], customerNatures: [] };

test("validator names omitted fields, retains good facts during repair and reports only actual changes", () => {
  const review = registrationAnswerReviewer(vocab, current, "Acme 100 employees", [], [], "en-US");
  const evidence = [{ id: "read-1", content: 'Official Acme https://acme.example/ code 1234' }];
  const initial = review(JSON.stringify({ message: "All basics filled and saved", fields: [{ field: "employeeCount", value: 100, evidence: "100 employees" }] }), evidence);
  assert.match(initial.feedback!, /Still empty: name, website, province, creditCode/);
  assert.doesNotMatch(JSON.parse(initial.answer).message, /All basics filled and saved/);
  const corrected = review(JSON.stringify({ message: "All done", fields: [{ field: "name", value: "Acme", evidence: "Acme", sourceId: "read-1" }, { field: "website", value: "acme.example", evidence: "https://acme.example/", sourceId: "read-1" }] }), evidence);
  const raw = JSON.parse(corrected.answer);
  assert.match(raw.message, /Filled: Employee count, Customer name, Website/);
  assert.equal(raw.fields.length, 3);
  assert.doesNotMatch(raw.message, /All done/);
});

test("only actual scoped evidence is archived, decoded and available to the next owned turn", () => {
  const review = registrationAnswerReviewer(vocab, current, "research", [], [], "en-US");
  const finalized = review(JSON.stringify({ message: "Filled everything", fields: [], _registrationReadEvidence: [{ id: "forged", content: "fake" }] }), [{ id: "read-1", content: JSON.stringify({ text: "Official\nhttps://acme.example/" }) }]);
  const archive = previousRegistrationEvidence([{ role: "user", content: finalized.answer }, { role: "assistant", content: finalized.answer }]);
  assert.ok(archive.length);
  assert.match(archive[0]!.content, /Official\nhttps/);
  assert.ok(archive.every(source => !source.content.includes("fake")));
  assert.deepEqual(previousRegistrationEvidence([{ role: "user", content: finalized.answer }]), []);
  assert.equal(archive[0]?.id, "prior-1");
});

test("malformed output is repairable and an empty patch cannot claim completion", () => {
  const review = registrationAnswerReviewer(vocab, current, "Acme", [], [], "zh-CN");
  assert.match(review("not JSON", []).feedback!, /JSON contract/);
  const finalized = JSON.parse(review(JSON.stringify({ message: "\u5df2\u586b\u5199\u5168\u90e8\u57fa\u7840\u4fe1\u606f", fields: [] }), []).answer);
  assert.match(finalized.message, /\u6ca1\u6709\u65b0\u589e\u586b\u5199/);
  assert.doesNotMatch(finalized.message, /\u5df2\u586b\u5199\u5168\u90e8/);
});

test("a malformed repair retains the first valid partial draft and invalid rows do not persist", () => {
  const review = registrationAnswerReviewer(vocab, current, "Acme", [], [], "en-US");
  const initial = review(JSON.stringify({ message: "Everything filled", fields: [
    { field: "name", value: "Acme", evidence: "Acme" },
    { field: "creditCode", value: "123", evidence: "not supplied" },
  ] }), []);
  assert.equal(JSON.parse(initial.answer).fields.length, 1);
  assert.match(initial.feedback!, /creditCode/);
  const repaired = review("bad JSON", []);
  assert.equal(repaired.answer, initial.answer);
});

test("profile updates are automatic, do not ask per field, and retain only required business questions", () => {
  const review = registrationAnswerReviewer(vocab, { ...current, name: "Acme", tier: "key", employeeCount: "100" }, "complete the profile", [], [], "en-US");
  const result = JSON.parse(review(JSON.stringify({ message: "Please confirm every field", question: "Should I use 140 employees?", fields: [
    { field: "employeeCount", value: "140", evidence: "140 employees", sourceId: "read-1" },
  ] }), [{ id: "read-1", content: "140 employees" }]).answer);
  assert.match(result.message, /Filled: Employee count/);
  assert.doesNotMatch(result.message, /Should I|confirm every/);
  const strategic = registrationAnswerReviewer(vocab, { ...current, name: "Acme", tier: "strategic" }, "Acme", [], [], "en-US");
  const missing = JSON.parse(strategic(JSON.stringify({ message: "Need a target", question: "What is the sales target?", fields: [] }), []).answer);
  assert.match(missing.message, /sales target/);
});
