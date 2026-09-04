import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaFieldStore, against a real Postgres - not the DDL constraints
// (field-evidence.db.test.ts already owns those), the TRANSLATION LAYER that
// sits on top of them.
//
// field-evidence.db.test.ts proves the CHECKs, the grants and the locks are
// real. It never once calls PrismaFieldStore - every insert in that file goes
// through raw SQL. So the class's actual application logic ran against
// nothing but the in-memory mirror: the transaction in recordInteraction()
// that ties an interaction to its participants, the two-query join in
// lastContactByContact() that computes a MAX per contact in JS rather than
// SQL, the filter/order clauses in listInteractions() and listCommitments(),
// and applyClosure()'s partial patch. Two mirrors agreeing (this class vs
// InMemoryFieldStore) says nothing about whether either is right - the same
// lesson column-locks.test.ts and adapters-prisma.db.test.ts already learned.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts. In CI the
// db-contract job applies the full DDL first.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "ffffffff-0000-0000-0000-000000000001";
const WS_OTHER = "ffffffff-0000-0000-0000-000000000002";
const ACC = "ffffffff-0000-0000-0000-0000000000a1";
const ACC2 = "ffffffff-0000-0000-0000-0000000000a2";
const CONTACT = "ffffffff-0000-0000-0000-0000000000c1";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function seedAccounts(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-FPS-1', 'Field Prisma Store', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-FPS-2', 'Field Prisma Store Two', 'active') ON CONFLICT DO NOTHING`,
    [ACC2, WS],
  );
  // incr/0026: a contact is a PERSON plus an EMPLOYMENT. The evidence tables
  // below still hold plain person ids - the rename kept every one of them - so
  // only the fixture setup changes, never the ids these tests assert on.
  await c.query(
    `INSERT INTO yucer_core.person (id, workspace_id, name, decision_role, status)
     VALUES ($1, $2, 'Contact One', 'economic', 'active') ON CONFLICT DO NOTHING`,
    [CONTACT, WS],
  );
  await c.query(
    `INSERT INTO yucer_core.person_affiliation (workspace_id, person_id, account_id)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [WS, CONTACT, ACC],
  );
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM yucer_field.commitment WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
    await c.query(`DELETE FROM yucer_field.interaction_participant WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
    await c.query(`DELETE FROM yucer_field.interaction WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
    await c.query(`DELETE FROM yucer_core.person WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaFieldStore } = await import("./field-prisma-store");
  return new PrismaFieldStore();
}

// --- recordInteraction -------------------------------------------------------

test("recordInteraction writes the interaction and every participant in one transaction", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    const row = await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "meeting",
      occurredAt: new Date("2026-08-01T10:00:00Z"),
      rawNote: "walked through the pilot scope",
      participants: [
        { contactId: CONTACT, roleAtTime: "economic" },
        { externalName: "a VP who joined late" },
      ],
    });

    assert.equal(row.accountId, ACC);
    assert.equal(row.rawNote, "walked through the pilot scope");
    assert.equal(row.direction, "outbound", "the adapter default, not left undefined");
    assert.equal(row.captureMode, "manual");

    const participants = await s.listParticipants(WS, row.id);
    assert.equal(participants.length, 2);
    const withContact = participants.find((p) => p.contactId === CONTACT);
    assert.ok(withContact);
    assert.equal(withContact?.roleAtTime, "economic");
    const external = participants.find((p) => p.externalName === "a VP who joined late");
    assert.ok(external);
    assert.equal(external?.contactId, null);
  } finally {
    await cleanup();
  }
});

test("recordInteraction with no participants writes zero rows, not a null crash", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    const row = await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-02T10:00:00Z"),
      rawNote: "left a voicemail",
    });
    const participants = await s.listParticipants(WS, row.id);
    assert.deepEqual(participants, []);
  } finally {
    await cleanup();
  }
});

// --- listInteractions ---------------------------------------------------------

test("listInteractions scopes by account, orders newest first, and respects limit", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-01T00:00:00Z"),
      rawNote: "first",
    });
    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-03T00:00:00Z"),
      rawNote: "third",
    });
    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-02T00:00:00Z"),
      rawNote: "second",
    });
    // On a different account - must not leak into the ACC-scoped read.
    await s.recordInteraction(WS, {
      accountId: ACC2,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-04T00:00:00Z"),
      rawNote: "other account",
    });

    const all = await s.listInteractions(WS, { accountId: ACC });
    assert.deepEqual(
      all.map((i) => i.rawNote),
      ["third", "second", "first"],
      "newest first, matching the ORDER BY",
    );

    const limited = await s.listInteractions(WS, { accountId: ACC, limit: 2 });
    assert.deepEqual(limited.map((i) => i.rawNote), ["third", "second"]);
  } finally {
    await cleanup();
  }
});

test("listInteractions filters by opportunityId, not just accountId", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-01T00:00:00Z"),
      rawNote: "no deal named",
    });
    const row = await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-02T00:00:00Z"),
      rawNote: "about a specific deal",
      opportunityId: null,
    });
    // opportunityId is nullable and there is no seeded opportunity here - this
    // test only needs to prove the filter narrows, so it checks the negative:
    // filtering by a made-up id returns nothing, including the row above.
    const filtered = await s.listInteractions(WS, { opportunityId: "00000000-0000-0000-0000-000000000000" });
    assert.deepEqual(filtered, []);
    assert.equal(row.opportunityId, null);
  } finally {
    await cleanup();
  }
});

// --- lastContactByContact: the two-query join, done in JS --------------------

test("lastContactByContact takes the MAX occurredAt per contact across several interactions", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-01T00:00:00Z"),
      rawNote: "earlier",
      participants: [{ contactId: CONTACT }],
    });
    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "meeting",
      occurredAt: new Date("2026-08-05T00:00:00Z"),
      rawNote: "later",
      participants: [{ contactId: CONTACT }],
    });

    const map = await s.lastContactByContact(WS, ACC);
    assert.equal(map.size, 1);
    assert.equal(map.get(CONTACT)?.toISOString(), "2026-08-05T00:00:00.000Z", "the later date wins, not row order");
  } finally {
    await cleanup();
  }
});

test("lastContactByContact ignores a participant with no contactId", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "meeting",
      occurredAt: new Date("2026-08-01T00:00:00Z"),
      rawNote: "external only",
      participants: [{ externalName: "someone not yet a contact" }],
    });

    const map = await s.lastContactByContact(WS, ACC);
    assert.equal(map.size, 0, "an external-only participant must not appear keyed by a null contact");
  } finally {
    await cleanup();
  }
});

test("lastContactByContact returns an empty map for an account with no interactions", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    const map = await s.lastContactByContact(WS, ACC);
    assert.equal(map.size, 0);
  } finally {
    await cleanup();
  }
});

// --- lastContactAt -------------------------------------------------------------

test("lastContactAt returns the most recent instant, or null when there is none", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    assert.equal(await s.lastContactAt(WS, ACC), null);

    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-01T00:00:00Z"),
      rawNote: "first",
    });
    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-09T00:00:00Z"),
      rawNote: "most recent",
    });
    await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "call",
      occurredAt: new Date("2026-08-04T00:00:00Z"),
      rawNote: "middle",
    });

    const at = await s.lastContactAt(WS, ACC);
    assert.equal(at?.toISOString(), "2026-08-09T00:00:00.000Z");
  } finally {
    await cleanup();
  }
});

// --- Commitments -----------------------------------------------------------

test("createCommitment and getCommitment round-trip, scoped to the workspace", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    const created = await s.createCommitment(WS, {
      accountId: ACC,
      direction: "we_owe",
      statement: "send the pilot proposal",
      ownerSub: "usr_rep",
      dueAt: new Date("2026-09-10T00:00:00Z"),
    });
    assert.equal(created.status, "open");
    assert.equal(created.closureEvidenceKind, null);

    const fetched = await s.getCommitment(WS, created.id);
    assert.deepEqual(fetched, created);

    // The same id, asked for under a workspace it does not belong to.
    const wrongWorkspace = await s.getCommitment(WS_OTHER, created.id);
    assert.equal(wrongWorkspace, null, "a commitment must not be readable outside its own workspace");
  } finally {
    await cleanup();
  }
});

test("listCommitments filters by status, account and overdueAt, and orders soonest-due first", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    const now = new Date("2026-09-01T00:00:00Z");

    const overdue = await s.createCommitment(WS, {
      accountId: ACC,
      direction: "they_owe",
      statement: "overdue promise",
      dueAt: new Date("2026-08-20T00:00:00Z"),
    });
    const dueSoon = await s.createCommitment(WS, {
      accountId: ACC,
      direction: "they_owe",
      statement: "due soon, not yet overdue",
      dueAt: new Date("2026-09-15T00:00:00Z"),
    });
    // Due in the future, deliberately - this commitment's job is to prove
    // account-scoping, not to also collide with the overdue/status assertions
    // below by incidentally qualifying as overdue itself.
    const otherAccount = await s.createCommitment(WS, {
      accountId: ACC2,
      direction: "we_owe",
      statement: "on a different account",
      dueAt: new Date("2026-09-25T00:00:00Z"),
    });

    const onAccount = await s.listCommitments(WS, { accountId: ACC });
    assert.deepEqual(
      onAccount.map((c) => c.id),
      [overdue.id, dueSoon.id],
      "soonest due first, and the other account's commitment excluded",
    );

    const overdueOnly = await s.listCommitments(WS, { overdueAt: now });
    assert.deepEqual(overdueOnly.map((c) => c.id), [overdue.id]);

    const closed = await s.applyClosure(WS, overdue.id, {
      status: "waived",
      waivedBySub: "usr_leader",
      waiveReason: "customer reorganised, promise no longer applies",
    });
    assert.equal(closed, true);

    // Waived is not open, so it must drop out of the overdue read even though
    // its due date is still in the past.
    const overdueAfterWaive = await s.listCommitments(WS, { overdueAt: now });
    assert.deepEqual(overdueAfterWaive, []);

    // Workspace-scoped, not account-scoped - the other account's commitment is
    // still open and belongs to this workspace, so it belongs in this read too.
    const openOnly = await s.listCommitments(WS, { status: "open" });
    assert.deepEqual(new Set(openOnly.map((c) => c.id)), new Set([dueSoon.id, otherAccount.id]));

    const openOnAccount = await s.listCommitments(WS, { status: "open", accountId: ACC });
    assert.deepEqual(openOnAccount.map((c) => c.id), [dueSoon.id]);
  } finally {
    await cleanup();
  }
});

test("applyClosure writes only the lifecycle columns the patch names, and returns false when nothing matched", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedAccounts);
    const s = await store();
    const created = await s.createCommitment(WS, {
      accountId: ACC,
      direction: "we_owe",
      statement: "arrange the technical deep dive",
      dueAt: new Date("2026-09-20T00:00:00Z"),
    });

    const missingEvidence = await s.recordInteraction(WS, {
      accountId: ACC,
      actorSub: "usr_rep",
      channel: "meeting",
      occurredAt: new Date("2026-09-05T00:00:00Z"),
      rawNote: "held the deep dive",
    });

    const ok = await s.applyClosure(WS, created.id, {
      status: "met",
      closureEvidenceKind: "interaction",
      closureEvidenceId: missingEvidence.id,
      metAt: new Date("2026-09-05T01:00:00Z"),
    });
    assert.equal(ok, true);

    const after = await s.getCommitment(WS, created.id);
    assert.equal(after?.status, "met");
    assert.equal(after?.closureEvidenceId, missingEvidence.id);
    // The promise itself is untouched - applyClosure only ever writes the
    // lifecycle columns 98's mirror allows.
    assert.equal(after?.statement, "arrange the technical deep dive");
    assert.equal(after?.direction, "we_owe");

    const nothingMatched = await s.applyClosure(WS, "00000000-0000-0000-0000-000000000000", { status: "missed" });
    assert.equal(nothingMatched, false);

    const wrongWorkspace = await s.applyClosure(WS_OTHER, created.id, { status: "missed" });
    assert.equal(wrongWorkspace, false, "a commitment must not be closeable from outside its own workspace");
  } finally {
    await cleanup();
  }
});
