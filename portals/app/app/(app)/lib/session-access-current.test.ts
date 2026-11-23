import { test } from "node:test";
import assert from "node:assert/strict";
import { toAuthUser } from "../../auth/lib/claims";
import { makeEntitlement } from "../../entitlement/resolver";
import { copilotSessionStillCurrent } from "./session-access-current";
const original: Parameters<typeof copilotSessionStillCurrent>[0] = {
  user: toAuthUser({ sub: "member", active_org: "org", active_workspace: "workspace" }),
  workspaceId: "workspace", entitlement: makeEntitlement("workspace", "yucer", { tier: "pro" }),
  authz: { sub: "member", workspaceId: "workspace", roles: ["sales_rep"], permissions: new Set(["copilot.use", "account.read"]), isWorkspaceOwner: false },
  scope: { kind: "workspace" },
};
test("assistant output stops on seat revocation, failed authority, changed identity, narrowed permissions or data scope", async () => {
  assert.equal(await copilotSessionStillCurrent(original, async () => original), true);
  assert.equal(await copilotSessionStillCurrent(original, async () => null), false);
  assert.equal(await copilotSessionStillCurrent(original, async () => { throw Error("authority unavailable"); }), false);
  for (const current of [
    { ...original, workspaceId: "other" },
    { ...original, user: { ...original.user, sub: "other" } },
    { ...original, user: { ...original.user, activeOrg: "other" } },
    { ...original, authz: { ...original.authz, permissions: new Set<"copilot.use">(["copilot.use"]) } },
    { ...original, entitlement: makeEntitlement("workspace", "yucer") },
  ]) assert.equal(await copilotSessionStillCurrent(original, async () => current), false);
});
