import { test } from "node:test";
import assert from "node:assert/strict";
import { isDossierRoute } from "./sidebar-slot";

test("an object's detail page renders its own dossier pane; its siblings and subpages do not", () => {
  assert.equal(isDossierRoute(["account", "acc_1"]), true);
  assert.equal(isDossierRoute(["pipeline", "opp_1"]), true);
  // Sibling routes that sit where an id would.
  assert.equal(isDossierRoute(["account", "complete"]), false);
  assert.equal(isDossierRoute(["pipeline", "new"]), false);
  // Lists, deeper pages and other modules keep the shell's own panes.
  assert.equal(isDossierRoute(["pipeline"]), false);
  assert.equal(isDossierRoute(["pipeline", "opp_1", "lines"]), false);
  assert.equal(isDossierRoute(["lead", "lead_1"]), false);
  assert.equal(isDossierRoute([]), false);
});
