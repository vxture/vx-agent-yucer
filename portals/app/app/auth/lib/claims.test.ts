import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canManageWorkspace,
  isWorkspaceOwner,
  parseRoles,
  toAuthUser,
} from "./claims";

// These tests exist specifically to prevent regressing the two CONFIRMED arda
// bugs (product_240 section 6 #27/#28): treating `admin` as a role, and comparing
// bare role codes without the scope prefix.

test("scope-prefixed owner/manager roles are recognized as manage", () => {
  assert.equal(canManageWorkspace(["workspace:owner"]), true);
  assert.equal(canManageWorkspace(["org:owner"]), true);
  assert.equal(canManageWorkspace(["workspace:manager"]), true);
  assert.equal(canManageWorkspace(["org:member", "workspace:manager"]), true);
});

test("non-manage governance roles are rejected", () => {
  assert.equal(canManageWorkspace(["workspace:member"]), false);
  assert.equal(canManageWorkspace(["workspace:readonly"]), false);
  assert.equal(canManageWorkspace(["workspace:guest"]), false);
  assert.equal(canManageWorkspace([]), false);
});

test("bug #28 guard: a BARE `owner` (no scope prefix) is not a manage role", () => {
  // The platform always issues scope-prefixed roles. A bare code is malformed
  // and must fail closed - never match `owner`/`manager` without the prefix.
  assert.equal(canManageWorkspace(["owner"]), false);
  assert.equal(canManageWorkspace(["manager"]), false);
});

test("bug #27 guard: `admin` is never a manage role (platform never issues it)", () => {
  assert.equal(canManageWorkspace(["admin"]), false);
  assert.equal(canManageWorkspace(["org:admin"]), false);
  assert.equal(canManageWorkspace(["workspace:admin"]), false);
});

test("role comparison is case-insensitive and trimmed", () => {
  assert.equal(canManageWorkspace([" WORKSPACE:OWNER "]), true);
});

test("isWorkspaceOwner matches workspace:owner only (subscription is workspace-level)", () => {
  assert.equal(isWorkspaceOwner(["workspace:owner"]), true);
  assert.equal(isWorkspaceOwner(["org:owner"]), false);
  assert.equal(isWorkspaceOwner(["workspace:manager"]), false);
});

test("parseRoles splits scope and role, lowercased", () => {
  assert.deepEqual(parseRoles(["org:owner", "workspace:manager"]), [
    { scope: "org", role: "owner" },
    { scope: "workspace", role: "manager" },
  ]);
  assert.deepEqual(parseRoles(["bare"]), [{ scope: "", role: "bare" }]);
});

test("toAuthUser maps claims and derives the gates; entitlement is not consumed", () => {
  const user = toAuthUser({
    sub: "usr_abc",
    active_org: "org_1",
    active_org_type: "organization",
    active_org_name: "Acme",
    active_workspace: "ws_1",
    active_workspace_name: "Sales HQ",
    roles: ["workspace:owner"],
    account_status: "active",
    name: "Jane Doe",
    email: "jane@example.test",
    phone: "+861234567890",
  });
  assert.equal(user.sub, "usr_abc");
  assert.equal(user.activeWorkspace, "ws_1");
  assert.equal(user.activeWorkspaceName, "Sales HQ");
  assert.equal(user.activeOrgName, "Acme");
  assert.equal(user.canManage, true);
  assert.equal(user.isWorkspaceOwner, true);
  assert.equal(user.accountStatus, "active");
  assert.equal(user.displayName, "Jane Doe");
  assert.equal(user.email, "jane@example.test");
  assert.equal(user.phone, "+861234567890");
  assert.equal(user.picture, null);
});

test("toAuthUser tolerates missing roles/context", () => {
  const user = toAuthUser({ sub: "usr_x" });
  assert.deepEqual(user.roles, []);
  assert.equal(user.canManage, false);
  assert.equal(user.activeWorkspace, null);
  assert.equal(user.activeWorkspaceName, null);
  assert.equal(user.activeOrgName, null);
  assert.equal(user.email, null);
  assert.equal(user.phone, null);
  assert.equal(user.picture, null);
});

// The bug this whole batch fixes: showing the raw usr_<uuid> instead of a name.
// displayName must never be empty, so the UI never falls back to its own
// second placeholder on top of this one.
test("displayName: real name wins, then preferred_username, then sub as the last resort", () => {
  assert.equal(toAuthUser({ sub: "usr_1", name: "Jane Doe", preferred_username: "jane" }).displayName, "Jane Doe");
  assert.equal(toAuthUser({ sub: "usr_1", preferred_username: "jane" }).displayName, "jane");
  assert.equal(toAuthUser({ sub: "usr_1" }).displayName, "usr_1");
});

test("picture is read only when present - never a guessed URL", () => {
  assert.equal(toAuthUser({ sub: "usr_1", picture: "https://cdn.example.test/a.png" }).picture, "https://cdn.example.test/a.png");
  assert.equal(toAuthUser({ sub: "usr_1" }).picture, null);
});
