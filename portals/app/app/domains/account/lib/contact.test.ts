import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import { planContact, type ContactDraft } from "./contact";

const draft = (over: Partial<ContactDraft> = {}): ContactDraft => ({
  name: "Zhang Gong",
  title: "QA Director",
  department: "Quality",
  decisionRole: "technical",
  influence: 60,
  status: "active",
  ...over,
});

test("a contact needs a name", () => {
  const r = planContact(draft({ name: "   " }));
  assert.equal(r.ok === false && r.violations[0].code, "name_required");
});

test("the decision role must be one the database will accept", () => {
  // chk_contact_decision_role would refuse it anyway, with a constraint name.
  // Refusing here names the field instead.
  const r = planContact(draft({ decisionRole: "sponsor" as never }));
  assert.equal(r.ok === false && r.violations[0].code, "unknown_decision_role");
});

test("the status must be one the database will accept", () => {
  const r = planContact(draft({ status: "gone" as never }));
  assert.equal(r.ok === false && r.violations[0].code, "unknown_status");
});

test("influence is 0-100 and whole", () => {
  for (const bad of [-1, 101, 60.5]) {
    const r = planContact(draft({ influence: bad }));
    assert.equal(r.ok === false && r.violations[0].code, "influence_range", String(bad));
  }
  assert.ok(planContact(draft({ influence: 0 })).ok);
  assert.ok(planContact(draft({ influence: 100 })).ok);
});

test("null influence is allowed, and is NOT the same as zero", () => {
  // "Nobody has judged this yet" against "judged, and this person has none".
  // Defaulting null to 0 would turn an unanswered question into an answer -
  // the same distinction attainment keeps for an unset quota.
  const t = unwrap(planContact(draft({ influence: null })));
  assert.equal(t.influence, null);
});

test("blank optional text becomes null rather than an empty string", () => {
  // An empty title in the column reads as "has no title"; "" reads as a title
  // that is blank. The database column is nullable for the first meaning.
  const t = unwrap(planContact(draft({ title: "  ", department: "" })));
  assert.equal(t.title, null);
  assert.equal(t.department, null);
});
