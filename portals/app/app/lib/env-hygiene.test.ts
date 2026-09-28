import { test } from "node:test";
import assert from "node:assert/strict";
import { dropCommentValues, isCommentValue } from "./env-hygiene";

// The production shape (2026-09-28): an empty key documented with an inline
// comment arrives with the comment as its value.

test("a value that is only a comment is dropped; real values - even with a # inside - stay", () => {
  const env: Record<string, string | undefined> = {
    S2S_CLIENT_ID: "# default: OIDC_CLIENT_ID",
    S2S_CLIENT_SECRET: "  # procure: OIDC_CLIENT_SECRET_<CLIENT>; the",
    JOBS_SCHEDULER: "# on | off; unset -> by stage",
    OIDC_CLIENT_ID: "yucer",
    POSTGRES_PASSWORD: "p@ss#word",
    EMPTY: "",
  };
  assert.deepEqual(dropCommentValues(env), ["JOBS_SCHEDULER", "S2S_CLIENT_ID", "S2S_CLIENT_SECRET"]);
  assert.deepEqual(env, { OIDC_CLIENT_ID: "yucer", POSTGRES_PASSWORD: "p@ss#word", EMPTY: "" });
  assert.equal(isCommentValue("# default"), true);
  assert.equal(isCommentValue("chat/default"), false);
  assert.equal(isCommentValue(undefined), false);
});
