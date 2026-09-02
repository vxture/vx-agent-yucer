import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaCopilotStore, against a real Postgres.
//
// The last adapter but one with no db coverage. Three things here cannot be
// tested against the in-memory mirror at all, because they are properties of
// Postgres rather than of the class:
//
//   - appendMessage()'s per-session advisory lock and the uidx it defends
//     (session, seq);
//   - createProposals()'s P2002 branch, which exists ONLY because of 0016's
//     PARTIAL unique index - the in-memory store has no index to collide on,
//     so the "a concurrent sweep already queued this" path has never run;
//   - applyDecision()'s compare-and-set, whose whole point is losing to
//     whoever moved the row first.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000009";
const SUBJECT = "eeeeeeee-0000-0000-0000-00000000aa10";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM yucer_agent.agent_message WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_agent.agent_action WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_agent.judgement_snooze WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_agent.agent_playbook WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_agent.agent_autonomy WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_agent.agent_session WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaCopilotStore } = await import("./prisma-store");
  return new PrismaCopilotStore();
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: null,
    actionType: "advance_stage",
    subjectType: "opportunity" as const,
    subjectId: SUBJECT,
    payload: { note: "x" },
    rationale: "because",
    confidence: 70,
    ...overrides,
  };
}

// --- sessions ------------------------------------------------------------------

test("createSession round-trips through getSession, including a null subject pair", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.createSession(WS, { actorSub: "usr_a", title: "First" });
    assert.equal(created.subjectType, null);
    assert.equal(created.subjectId, null);
    assert.equal(created.status, "open");

    const fetched = await s.getSession(WS, created.id);
    assert.equal(fetched?.id, created.id);
    assert.equal(fetched?.title, "First");
  } finally {
    await cleanup();
  }
});

test("a session with half a subject pair is refused by the real CHECK", { skip }, async () => {
  // subject_type and subject_id travel together - a type with no id is a
  // conversation about nothing in particular that claims to be about something.
  await cleanup();
  try {
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO yucer_agent.agent_session (workspace_id, actor_sub, subject_type)
             VALUES ($1, 'usr_a', 'opportunity')`,
            [WS],
          ),
        ),
      /chk_agent_session_subject_pair/,
    );
  } finally {
    await cleanup();
  }
});

test("getSession does not cross a workspace boundary", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.createSession(WS, { actorSub: "usr_a" });
    assert.equal(await s.getSession("eeeeeeee-0000-0000-0000-0000000000ff", created.id), null);
  } finally {
    await cleanup();
  }
});

test("listSessions returns one actor's sessions, most recently touched first", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const older = await s.createSession(WS, { actorSub: "usr_a", title: "Older" });
    const newer = await s.createSession(WS, { actorSub: "usr_a", title: "Newer" });
    await s.createSession(WS, { actorSub: "usr_b", title: "Somebody else" });
    await withPg((c) =>
      c.query(`UPDATE yucer_agent.agent_session SET updated_at = now() - interval '1 day' WHERE id = $1`, [older.id]),
    );

    const mine = await s.listSessions(WS, "usr_a");
    assert.deepEqual(mine.map((r) => r.id), [newer.id, older.id]);
    assert.equal(mine.length, 2, "another member's session must not appear");
  } finally {
    await cleanup();
  }
});

// --- messages --------------------------------------------------------------------

test("appendMessage numbers seq from 1 per session and listMessages reads them in order", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const a = await s.createSession(WS, { actorSub: "usr_a" });
    const b = await s.createSession(WS, { actorSub: "usr_a" });

    await s.appendMessage(WS, { sessionId: a.id, role: "user", content: "one" });
    await s.appendMessage(WS, { sessionId: a.id, role: "assistant", content: "two", tokenCount: 12 });
    const first = await s.appendMessage(WS, { sessionId: b.id, role: "user", content: "other thread" });

    assert.equal(first.seq, 1, "seq restarts per session, not per workspace");
    const msgs = await s.listMessages(WS, a.id);
    assert.deepEqual(msgs.map((m) => m.seq), [1, 2]);
    assert.deepEqual(msgs.map((m) => m.content), ["one", "two"]);
    assert.equal(msgs[1].tokenCount, 12);
  } finally {
    await cleanup();
  }
});

test("appendMessage touches the session, so the recent-sessions order stays honest", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const older = await s.createSession(WS, { actorSub: "usr_a", title: "Older" });
    const newer = await s.createSession(WS, { actorSub: "usr_a", title: "Newer" });
    await withPg((c) =>
      c.query(`UPDATE yucer_agent.agent_session SET updated_at = now() - interval '1 day' WHERE id = $1`, [older.id]),
    );
    assert.deepEqual((await s.listSessions(WS, "usr_a")).map((r) => r.id), [newer.id, older.id]);

    await s.appendMessage(WS, { sessionId: older.id, role: "user", content: "back to this one" });
    assert.deepEqual(
      (await s.listSessions(WS, "usr_a")).map((r) => r.id),
      [older.id, newer.id],
      "the session just spoken in must come first",
    );
  } finally {
    await cleanup();
  }
});

test("appendMessage refuses a session from another workspace rather than writing into it", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const mine = await s.createSession(WS, { actorSub: "usr_a" });
    await assert.rejects(
      () => s.appendMessage("eeeeeeee-0000-0000-0000-0000000000ff", { sessionId: mine.id, role: "user", content: "x" }),
      /is not in workspace/,
    );
  } finally {
    await cleanup();
  }
});

test("an unrecognised message role is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const sess = await s.createSession(WS, { actorSub: "usr_a" });
    await assert.rejects(
      () => s.appendMessage(WS, { sessionId: sess.id, role: "narrator" as never, content: "x" }),
      /chk_agent_message_role/,
    );
  } finally {
    await cleanup();
  }
});

// --- proposals ---------------------------------------------------------------------

test("createProposals writes every proposal as `proposed`, never as decided", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.createProposals(WS, [proposal(), proposal({ actionType: "draft_email" })]);
    assert.equal(created.length, 2);
    assert.deepEqual([...new Set(created.map((a) => a.status))], ["proposed"]);
    assert.deepEqual(created.map((a) => a.decidedBySub), [null, null]);
  } finally {
    await cleanup();
  }
});

test("createProposals carries the capability key through to the row", { skip }, async () => {
  // ADR-015, and the reason this matters more than most round-trips: incr/0008
  // grants NO UPDATE on `capability`, so a value dropped on the way in can
  // never be repaired afterwards. The in-memory mirror has always written it,
  // which is exactly what would keep the loss invisible in every other test.
  await cleanup();
  try {
    const s = await store();
    const [created] = await s.createProposals(WS, [proposal({ capability: "deal_desk" })]);
    assert.equal(created.capability, "deal_desk");
    assert.equal((await s.getProposal(WS, created.id))?.capability, "deal_desk");
  } finally {
    await cleanup();
  }
});

test("a second OPEN sweep proposal for one commitment is skipped, not thrown", { skip }, async () => {
  // 0016's PARTIAL unique index, and the only place the P2002 branch runs.
  // Losing this race is the outcome the caller wanted: the other writer's
  // proposal is already in the queue.
  await cleanup();
  try {
    const s = await store();
    const sweep = () =>
      proposal({ actionType: "chase_overdue_commitment", payload: { commitmentId: "c-1" } });

    const first = await s.createProposals(WS, [sweep()]);
    assert.equal(first.length, 1);

    const second = await s.createProposals(WS, [sweep()]);
    assert.deepEqual(second, [], "the duplicate is dropped rather than raising");

    const all = await s.listProposals(WS, { status: "proposed" });
    assert.equal(all.length, 1);
  } finally {
    await cleanup();
  }
});

test("the partial index only binds while the first proposal is still open", { skip }, async () => {
  // Once the earlier one is decided, the commitment can be chased again -
  // otherwise a commitment could only ever be chased once in its lifetime.
  await cleanup();
  try {
    const s = await store();
    const sweep = () =>
      proposal({ actionType: "chase_overdue_commitment", payload: { commitmentId: "c-1" } });
    const [first] = await s.createProposals(WS, [sweep()]);
    await s.applyDecision(WS, [
      { id: first.id, patch: { status: "rejected", decidedBySub: "usr_a", decidedAt: new Date() }, from: ["proposed"] },
    ]);

    const again = await s.createProposals(WS, [sweep()]);
    assert.equal(again.length, 1, "a closed predecessor must not block a fresh chase");
  } finally {
    await cleanup();
  }
});

test("a confidence outside 0-100 is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(() => s.createProposals(WS, [proposal({ confidence: 140 })]), /chk_agent_action_confidence/);
  } finally {
    await cleanup();
  }
});

test("listProposals filters by status, subjectType and subjectId", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const other = "eeeeeeee-0000-0000-0000-00000000aa11";
    const [a] = await s.createProposals(WS, [proposal()]);
    await s.createProposals(WS, [proposal({ subjectType: "account", subjectId: other })]);
    await s.applyDecision(WS, [
      { id: a.id, patch: { status: "accepted", decidedBySub: "usr_a", decidedAt: new Date() }, from: ["proposed"] },
    ]);

    assert.deepEqual((await s.listProposals(WS, { status: "accepted" })).map((r) => r.id), [a.id]);
    assert.deepEqual((await s.listProposals(WS, { subjectType: "account" })).map((r) => r.subjectId), [other]);
    assert.equal((await s.listProposals(WS, { subjectId: SUBJECT })).length, 1);
    assert.equal((await s.listProposals(WS, { limit: 1 })).length, 1);
  } finally {
    await cleanup();
  }
});

test("getProposal is workspace-scoped in the query", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const [a] = await s.createProposals(WS, [proposal()]);
    assert.ok(await s.getProposal(WS, a.id));
    assert.equal(await s.getProposal("eeeeeeee-0000-0000-0000-0000000000ff", a.id), null);
  } finally {
    await cleanup();
  }
});

// --- applyDecision -------------------------------------------------------------------

test("applyDecision is a compare-and-set: a proposal someone else moved first is left alone", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const [a] = await s.createProposals(WS, [proposal()]);
    const accept = {
      id: a.id,
      patch: { status: "accepted" as const, decidedBySub: "usr_first", decidedAt: new Date() },
      from: ["proposed" as const],
    };

    assert.deepEqual(await s.applyDecision(WS, [accept]), [a.id]);
    // The stale form, submitted second, must not overwrite the first decider.
    const again = await s.applyDecision(WS, [
      { ...accept, patch: { status: "rejected", decidedBySub: "usr_second", decidedAt: new Date() } },
    ]);
    assert.deepEqual(again, [], "a second decision from `proposed` must not land");

    const after = await s.getProposal(WS, a.id);
    assert.equal(after?.status, "accepted");
    assert.equal(after?.decidedBySub, "usr_first", "the first decider's name must survive");
  } finally {
    await cleanup();
  }
});

test("applyDecision on an empty list does no work and returns nothing", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    assert.deepEqual(await s.applyDecision(WS, []), []);
  } finally {
    await cleanup();
  }
});

test("a frozen proposal column in the patch is ignored, never written", { skip }, async () => {
  // payload / rationale / confidence are the model's recommendation AT THE
  // TIME; a revised recommendation is a new proposal.
  //
  // Note what actually defends that here, because it is not the column-lock
  // guard. `data` is assembled key by key from a fixed whitelist, so an extra
  // key never reaches assertWritable at all - the guard is a backstop against a
  // future careless addition to that whitelist, and cannot be provoked through
  // this method's public surface. The property worth pinning is therefore the
  // silent drop, not a throw.
  await cleanup();
  try {
    const s = await store();
    const [a] = await s.createProposals(WS, [proposal({ rationale: "the original reason" })]);
    const moved = await s.applyDecision(WS, [
      {
        id: a.id,
        patch: { status: "accepted", decidedBySub: "usr_a", decidedAt: new Date(), rationale: "rewritten" } as never,
        from: ["proposed"],
      },
    ]);
    assert.deepEqual(moved, [a.id], "the decision itself still lands");
    const after = await s.getProposal(WS, a.id);
    assert.equal(after?.status, "accepted");
    assert.equal(after?.rationale, "the original reason", "the recommendation must be untouched");
  } finally {
    await cleanup();
  }
});

// --- autonomy -------------------------------------------------------------------------

test("getAutonomy is null until a posture is set, then reads back what was decided", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    assert.equal(await s.getAutonomy(WS), null);

    const set = await s.setAutonomy(WS, { mode: "autonomous", decidedBySub: "usr_admin" });
    assert.equal(set.mode, "autonomous");
    assert.equal(set.decidedBySub, "usr_admin");
    assert.equal((await s.getAutonomy(WS))?.mode, "autonomous");
  } finally {
    await cleanup();
  }
});

test("setAutonomy upserts on the workspace key rather than adding a second posture", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.setAutonomy(WS, { mode: "autonomous", decidedBySub: "usr_a" });
    await s.setAutonomy(WS, { mode: "ask_always", decidedBySub: "usr_b" });
    const rows = await withPg((c) =>
      c.query(`SELECT count(*)::int AS n FROM yucer_agent.agent_autonomy WHERE workspace_id = $1`, [WS]),
    );
    assert.equal(rows.rows[0].n, 1, "one posture per workspace, always");
    assert.equal((await s.getAutonomy(WS))?.decidedBySub, "usr_b");
  } finally {
    await cleanup();
  }
});

test("an unrecognised autonomy mode is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(
      () => s.setAutonomy(WS, { mode: "do_whatever" as never, decidedBySub: "usr_a" }),
      /chk_agent_autonomy_mode/,
    );
  } finally {
    await cleanup();
  }
});

// --- playbooks --------------------------------------------------------------------------

async function seedPlaybook(c: Client, code: string, fields: Record<string, unknown> = {}) {
  const f = { scope: "pipeline", status: "active", version: 1, ...fields };
  await c.query(
    `INSERT INTO yucer_agent.agent_playbook
       (workspace_id, playbook_code, name, scope_domain, content, version, status)
     VALUES ($1, $2, $3, $4, 'body', $5, $6)`,
    [WS, code, `Play ${code}`, f.scope, f.version, f.status],
  );
}

test("listPlaybooks returns active plays only by default, newest version first", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seedPlaybook(c, "P-A", { version: 1 });
      await seedPlaybook(c, "P-B", { version: 3 });
      await seedPlaybook(c, "P-DRAFT", { status: "draft" });
    });
    const s = await store();
    const active = await s.listPlaybooks(WS);
    assert.deepEqual(active.map((p) => p.playbookCode), ["P-B", "P-A"]);
    assert.equal(active[0].version, 3);
  } finally {
    await cleanup();
  }
});

test("listPlaybooks includes drafts only when activeOnly is explicitly false", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seedPlaybook(c, "P-A");
      await seedPlaybook(c, "P-DRAFT", { status: "draft" });
    });
    const s = await store();
    assert.equal((await s.listPlaybooks(WS, { activeOnly: false })).length, 2);
    assert.equal((await s.listPlaybooks(WS, { activeOnly: true })).length, 1);
  } finally {
    await cleanup();
  }
});

test("listPlaybooks filters by scope domain and honours limit", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seedPlaybook(c, "P-PIPE", { scope: "pipeline" });
      await seedPlaybook(c, "P-ACC", { scope: "account" });
    });
    const s = await store();
    assert.deepEqual((await s.listPlaybooks(WS, { scopeDomain: "account" })).map((p) => p.playbookCode), ["P-ACC"]);
    assert.equal((await s.listPlaybooks(WS, { limit: 1 })).length, 1);
  } finally {
    await cleanup();
  }
});

// --- judgement snoozes -------------------------------------------------------------------

test("snoozeJudgement upserts, so re-deferring moves the row rather than adding one", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const later = new Date(Date.now() + 3_600_000);
    await s.snoozeJudgement(WS, { sub: "usr_a", judgementId: "stalled:acc-1", urgency: "today", until: later });
    await s.snoozeJudgement(WS, { sub: "usr_a", judgementId: "stalled:acc-1", urgency: "week", until: later });

    const rows = await withPg((c) =>
      c.query(`SELECT count(*)::int AS n FROM yucer_agent.judgement_snooze WHERE workspace_id = $1`, [WS]),
    );
    assert.equal(rows.rows[0].n, 1);
    const live = await s.listSnoozes(WS, "usr_a", new Date());
    assert.equal(live[0].urgency, "week");
  } finally {
    await cleanup();
  }
});

test("listSnoozes returns only what is still live, and only for that member", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const past = new Date(Date.now() - 3_600_000);
    const future = new Date(Date.now() + 3_600_000);
    await s.snoozeJudgement(WS, { sub: "usr_a", judgementId: "live", urgency: "today", until: future });
    await s.snoozeJudgement(WS, { sub: "usr_a", judgementId: "expired", urgency: "today", until: past });
    await s.snoozeJudgement(WS, { sub: "usr_b", judgementId: "somebody-else", urgency: "today", until: future });

    const mine = await s.listSnoozes(WS, "usr_a", new Date());
    assert.deepEqual(mine.map((r) => r.judgementId), ["live"]);
  } finally {
    await cleanup();
  }
});

test("an unrecognised snooze urgency is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(
      () =>
        s.snoozeJudgement(WS, {
          sub: "usr_a",
          judgementId: "j",
          urgency: "whenever",
          until: new Date(Date.now() + 1000),
        }),
      /judgement_snooze_urgency_ck/,
    );
  } finally {
    await cleanup();
  }
});
