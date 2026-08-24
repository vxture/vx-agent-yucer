-- 0005_judgement_snooze.sql - "not now" for a derived judgement.
--
-- WHY: the home screen is a decision queue and nothing could leave it. A queue
-- you cannot clear is not a queue - it is a list that grows until people stop
-- reading it, which costs more than not having built it.
--
-- THE TRAP THIS TABLE IS SHAPED AROUND. A judgement id is DERIVED, not stored:
-- `stalled:acc_1` is recomputed from evidence on every request. So a row here
-- does not suppress a record, it suppresses a CONCLUSION - and the same
-- conclusion will be reached again tomorrow from worse facts. A plain "dismiss"
-- would therefore hide an escalating problem behind a decision someone made
-- when it was still small. That is the worst failure available to this screen:
-- the queue looks clear precisely because the alarm was switched off.
--
-- So this is a SNOOZE, bounded two ways, and both are required:
--
--   1. snoozed_until - it comes back on its own. A judgement nobody ever sees
--      again is indistinguishable from one that was never derived.
--   2. urgency_at_snooze - it comes back EARLY if the tier escalates. Deciding
--      "watch" can wait says nothing about whether "today" can.
--
-- The tier is stored rather than a hash of the facts on purpose. Facts drift
-- continuously - "50 天未接触" changes every night - so a fingerprint over them
-- would expire the snooze within a day and make the button useless. The tier
-- changes only when the situation materially does, which is the event a person
-- actually wants to be re-interrupted by.
--
-- Idempotent throughout.

-- ===========================================================================
-- judgement_snooze - one person deferring one conclusion.
-- ===========================================================================
-- Lives in yucer_agent because it records a HUMAN DECISION ABOUT AGENT OUTPUT,
-- which is what this schema is for under ADR-003. It is not an agent_action:
-- nothing proposed it, and nothing executes as a result.
--
-- Per (workspace, member, judgement). Deliberately NOT per workspace: one
-- member deciding a thing can wait must not blank it from a colleague's queue,
-- and least of all from their manager's.
CREATE TABLE IF NOT EXISTS yucer_agent.judgement_snooze (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,                    -- [ref] isolation key
  sub               TEXT NOT NULL,                    -- whose queue this leaves
  judgement_id      TEXT NOT NULL,                    -- derived id, e.g. stalled:<account>
  urgency_at_snooze TEXT NOT NULL,                    -- today | week | watch
  snoozed_until     TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT judgement_snooze_urgency_ck
    CHECK (urgency_at_snooze IN ('today', 'week', 'watch'))
);

-- One live snooze per member per judgement. Re-snoozing overwrites rather than
-- accumulating, so "how long has this been deferred" stays answerable.
CREATE UNIQUE INDEX IF NOT EXISTS judgement_snooze_unique
  ON yucer_agent.judgement_snooze (workspace_id, sub, judgement_id);

-- The read is always "what is still snoozed for me right now".
CREATE INDEX IF NOT EXISTS judgement_snooze_live
  ON yucer_agent.judgement_snooze (workspace_id, sub, snoozed_until);

-- ===========================================================================
-- Grants and locks, HERE rather than in 97/98 - see incr/README.md. db-init
-- applies both of those before this file, so a grant written there would land
-- on a table that does not exist and a REVOKE would abort the run.
-- ===========================================================================
GRANT USAGE ON SCHEMA yucer_agent TO yucer_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_agent.judgement_snooze TO yucer_svc;

-- Only the two fields a re-snooze may move. Everything else is written once:
-- which judgement, whose queue, and when it was first deferred are the record.
REVOKE UPDATE ON yucer_agent.judgement_snooze FROM yucer_svc;
GRANT UPDATE (urgency_at_snooze, snoozed_until)
  ON yucer_agent.judgement_snooze TO yucer_svc;
