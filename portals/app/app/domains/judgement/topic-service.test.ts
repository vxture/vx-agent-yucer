import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { InMemoryTaskStore } from "../copilot/task-store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryTopicStore } from "./topic-store";
import {
  openTopic,
  changeTopic,
  listTopics,
  readTopicEvidence,
  type TopicContext,
} from "./topic-service";
import { ok, unwrap } from "../shared/result";
import type { Judgement } from "./lib/judgement";
const WS = "aa000000-0000-4000-a000-000000000001",
  ID = "aa000000-0000-4000-a000-000000000010";
function fixture() {
  let findings: Judgement[] = [
    {
      id: "missing-contact:" + ID,
      subjectType: "account",
      subjectId: ID,
      subjectName: "Authorized account",
      source: "rule",
      urgency: "week",
      claim: "Decision maker not covered",
      facts: [],
      tags: [],
      citations: [{ kind: "structure", text: "No decision maker on record" }],
      analyses: [],
    },
  ];
  let readable = true,
    available = true;
  const ctx: TopicContext = {
    workspaceId: WS,
    sub: "alice",
    holder: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      product: "yucer",
      workspace_id: WS,
      tier: "pro",
    },
    store: new InMemoryTaskStore(),
    sessions: new InMemoryCopilotStore(),
    topics: new InMemoryTopicStore(),
    accessVersion: "acl-v1",
    refresh: async () => ctx,
    judgements: async (scope) =>
      ok({
        scope: scope ?? "mine",
        judgements: findings,
        scanned: available ? 1 : 0,
        dataAvailable: available,
      }),
    snooze: async () => ok({}),
    source: async (o) =>
      o.kind === "judgement"
        ? await readTopicEvidence(ctx, o.id).then((r) =>
            r ? { ...o, version: r.version } : null,
          )
        : readable
          ? { ...o, version: "current-v1" }
          : null,
  };
  const start = async () =>
    unwrap(
      await openTopic(ctx, { judgementId: findings[0].id, scope: "mine" }),
    );
  const row = async (id: string) =>
    (await ctx.topics.get({ workspaceId: WS, actorSub: "alice" }, id))!;
  return {
    ctx,
    start,
    row,
    setFindings: (v: Judgement[]) => {
      findings = v;
    },
    setReadable: (v: boolean) => {
      readable = v;
    },
    setAvailable: (v: boolean) => {
      available = v;
    },
  };
}
test("cached list delivery avoids rule scans and refuses a concurrent source revision or access change", async () => {
  const f = fixture(), raw = unwrap(await f.ctx.judgements("mine"));
  f.ctx.dailyFeed = async () => ok({ raw, visible: raw, dataVersion: "one", pendingUpdate: true,
    daily: { date: "2026-11-25", generatedAt: "2026-11-25T00:00:00Z", revalidatedAt: "2026-11-25T00:00:00Z", changes: 0, nextScheduledAt: "2026-11-26T00:00:00Z", reused: true } });
  f.ctx.judgements = async () => assert.fail("list must not rerun rules");
  f.ctx.judgementRevision = async () => "one";
  const result = unwrap(await listTopics(f.ctx, "mine", "snapshot"));
  assert.equal(result.pendingUpdate, true); assert.equal(result.judgements.length, 1);
  f.ctx.judgementRevision = async () => "two";
  assert.equal((await listTopics(f.ctx, "mine")).ok, false);
  f.ctx.judgementRevision = async () => "one";
  let checks = 0;
  f.ctx.refresh = async () => ({ ...f.ctx, accessVersion: ++checks > 1 ? "changed" : "acl-v1" });
  assert.equal((await listTopics(f.ctx, "mine")).ok, false);
});
test("same authorized finding reuses one private continuing task, concurrent open is idempotent", async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.start(), f.start()]);
  assert.equal(a.taskId, b.taskId);
  const feed = unwrap(await listTopics(f.ctx, "mine"));
  assert.equal(feed.judgements[0].taskId, a.taskId);
  assert.ok(await readTopicEvidence(f.ctx, a.topicId));
  const other = { ...f.ctx, sub: "bob" };
  assert.equal(await readTopicEvidence(other, a.topicId), null);
});
test("resolution requires business disappearance, current read access and unchanged ACL", async () => {
  const f = fixture(),
    a = await f.start();
  let row = await f.row(a.topicId);
  const still = unwrap(
    await changeTopic(f.ctx, a.topicId, {
      action: "verify",
      revision: row.revision,
    }),
  );
  assert.equal(still.verified, false);
  row = await f.row(a.topicId);
  f.setFindings([]);
  f.setReadable(false);
  assert.equal(
    (
      await changeTopic(f.ctx, a.topicId, {
        action: "verify",
        revision: row.revision,
      })
    ).ok,
    false,
  );
  f.setReadable(true);
  f.setAvailable(false);
  assert.equal(
    (
      await changeTopic(f.ctx, a.topicId, {
        action: "verify",
        revision: row.revision,
      })
    ).ok,
    false,
  );
  f.setAvailable(true);
  f.ctx.accessVersion = "acl-v2";
  assert.equal(
    (
      await changeTopic(f.ctx, a.topicId, {
        action: "verify",
        revision: row.revision,
      })
    ).ok,
    false,
  );
  f.ctx.accessVersion = "acl-v1";
  assert.equal(
    unwrap(
      await changeTopic(f.ctx, a.topicId, {
        action: "verify",
        revision: row.revision,
      }),
    ).verified,
    true,
  );
});
test("workflow CAS, actor and space substitution refuse changes", async () => {
  const f = fixture(),
    a = await f.start(),
    r = await f.row(a.topicId);
  const updates = await Promise.all([
    changeTopic(f.ctx, a.topicId, { action: "process", revision: r.revision }),
    changeTopic(f.ctx, a.topicId, { action: "verify", revision: r.revision }),
  ]);
  assert.equal(updates.filter((r) => r.ok).length, 1);
  const bob = { ...f.ctx, sub: "bob" };
  bob.refresh = async () => bob;
  assert.equal(
    (
      await changeTopic(bob, a.topicId, {
        action: "process",
        revision: r.revision + 1,
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await openTopic(f.ctx, {
        judgementId: "foreign",
        scope: "all",
        workspaceId: WS,
      })
    ).ok,
    false,
  );
  f.ctx.holder = { permissions: new Set() };
  assert.equal((await listTopics(f.ctx)).ok, false);
});
