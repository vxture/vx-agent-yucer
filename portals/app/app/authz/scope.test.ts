import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DATA_SCOPES,
  UNSCOPED,
  expandTerritories,
  isDataScope,
  validateScopeSetting,
} from "./scope";
import { unwrap } from "../domains/shared/result";

// --- The three values --------------------------------------------------------

test("the scope vocabulary is closed, so a bad row cannot widen anybody", () => {
  // The DDL has a CHECK, but a value arriving from anywhere else must not
  // become a scope by being spelled like one - and the failure direction here
  // matters: an unrecognised scope must not fall through to "workspace".
  assert.deepEqual([...DATA_SCOPES], ["workspace", "territory", "own"]);
  assert.equal(isDataScope("own"), true);
  assert.equal(isDataScope("everything"), false);
  assert.equal(isDataScope(""), false);
});

test("the default configuration narrows nothing", () => {
  // Deliberately not fail-closed - the opposite of agent_autonomy's default,
  // and for the opposite reason. Scope takes visibility AWAY from people who
  // have it today; a migration must not do that on the administrator's behalf.
  assert.equal(UNSCOPED.kind, "workspace");
  assert.deepEqual(UNSCOPED.territoryIds, []);
});

// --- Refusing a half-finished setting ---------------------------------------

test("a territory scope with no territories is refused at the point of saving", () => {
  // Not a security problem - it resolves to seeing nothing, which is the safe
  // direction. It is a half-finished setting, and the administrator who saved
  // it would believe they had granted a region.
  const r = validateScopeSetting({ kind: "territory", territoryIds: [] });
  assert.equal(r.ok === false && r.violations[0].code, "territory_required");
});

test("workspace and own carry no territories, and a stale list is ignored", () => {
  // Switching away from `territory` leaves rows behind. That is not an error to
  // report at somebody - it is a list nothing reads.
  unwrap(validateScopeSetting({ kind: "workspace", territoryIds: ["t_1"] }));
  unwrap(validateScopeSetting({ kind: "own", territoryIds: ["t_1"] }));
});

test("an unknown scope is refused rather than treated as workspace", () => {
  const r = validateScopeSetting({ kind: "region" as never, territoryIds: [] });
  assert.equal(r.ok === false && r.violations[0].code, "unknown_scope");
});

// --- The hierarchy ----------------------------------------------------------

test("a director assigned a parent sees its children, and their children", () => {
  // The whole reason territory has carried parent_id since the baseline.
  // Assigning every leaf by hand would make the hierarchy decorative and the
  // configuration wrong the day somebody adds a sub-region.
  const parents = new Map<string, string | null>([
    ["china", null],
    ["east", "china"],
    ["shanghai", "east"],
    ["jiangsu", "east"],
    ["north", "china"],
  ]);
  assert.deepEqual(expandTerritories(["east"], parents).sort(), ["east", "jiangsu", "shanghai"]);
  assert.deepEqual(
    expandTerritories(["china"], parents).sort(),
    ["china", "east", "jiangsu", "north", "shanghai"],
  );
});

test("a leaf expands to itself, not to its siblings", () => {
  const parents = new Map<string, string | null>([
    ["east", null],
    ["shanghai", "east"],
    ["jiangsu", "east"],
  ]);
  assert.deepEqual(expandTerritories(["shanghai"], parents), ["shanghai"]);
});

test("two assignments merge without duplicating the overlap", () => {
  const parents = new Map<string, string | null>([
    ["east", null],
    ["shanghai", "east"],
  ]);
  assert.deepEqual(expandTerritories(["east", "shanghai"], parents).sort(), ["east", "shanghai"]);
});

test("a cycle in parent_id terminates instead of hanging the request", () => {
  // parent_id is a plain self-reference with nothing preventing a loop. A data
  // correction that made one would otherwise spin here - and a hung request is
  // a worse failure than a wrong page, because nothing reports it.
  const parents = new Map<string, string | null>([
    ["a", "b"],
    ["b", "a"],
  ]);
  assert.deepEqual(expandTerritories(["a"], parents).sort(), ["a", "b"]);
});

test("an assignment naming a territory that no longer exists yields just itself", () => {
  // The id carries no foreign key - local_authz must not depend on a domain -
  // so a deleted territory leaves the assignment behind. It expands to nothing
  // beyond itself, which narrows to no rows rather than widening to all of them.
  assert.deepEqual(expandTerritories(["gone"], new Map()), ["gone"]);
});
