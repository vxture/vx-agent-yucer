import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAuthzStore } from "../authz/store";
import { listActiveWorkspaces } from "./workspaces";

// A workspace exists for the jobs once it has had a member; each once.

test("lists every workspace that has a member, each once, and nothing before the first login", async () => {
  const store = new InMemoryAuthzStore();
  assert.deepEqual(await listActiveWorkspaces(store), []);
  await store.seeMember({ workspaceId: "ws_a", sub: "usr_1" });
  await store.seeMember({ workspaceId: "ws_a", sub: "usr_2" });
  await store.seeMember({ workspaceId: "ws_b", sub: "usr_3" });
  assert.deepEqual([...(await listActiveWorkspaces(store))].sort(), ["ws_a", "ws_b"]);
});
