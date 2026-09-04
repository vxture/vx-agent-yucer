// planContact, after incr/0027.
//
// TWO TESTS LEFT THIS FILE with that increment: the decision-role vocabulary
// check and the influence range check. Neither is gone from the product - they
// moved to setBuyingRole, where the question they validate can be asked. A
// person is not an economic buyer with an influence of 60; they are that ON A
// DEAL, and validating it here would have meant a rule guarding a field its
// own type no longer has.

import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import { planContact, type ContactDraft } from "./contact";

const draft = (over: Partial<ContactDraft> = {}): ContactDraft => ({
  name: "Zhang Gong",
  title: "QA Director",
  department: "Quality",
  email: null,
  mobile: null,
  wechat: null,
  status: "active",
  ...over,
});

test("a contact needs a name", () => {
  const r = planContact(draft({ name: "   " }));
  assert.equal(r.ok === false && r.violations[0].code, "name_required");
});


test("the status must be one the database will accept", () => {
  const r = planContact(draft({ status: "gone" as never }));
  assert.equal(r.ok === false && r.violations[0].code, "unknown_status");
});



test("blank optional text becomes null rather than an empty string", () => {
  // An empty title in the column reads as "has no title"; "" reads as a title
  // that is blank. The database column is nullable for the first meaning.
  const t = unwrap(planContact(draft({ title: "  ", department: "" })));
  assert.equal(t.title, null);
  assert.equal(t.department, null);
});
