-- 0004_field_evidence.sql - the evidence plane (ADR-006).
--
-- WHY: 34 tables and not one records that a human spoke to a customer. The
-- consequence is live in running code - account health's "last interaction" is
-- actually opportunity_stage_event.occurred_at, i.e. "the last time someone
-- moved a deal stage", which the adapter's own comment admits is a proxy. Three
-- calls, two proposals and a site visit register as NO CONTACT unless somebody
-- also dragged a card.
--
-- This increment is the first in the repo's life to CREATE a table, so it is
-- also the first to hit the two ordering traps ADR-006 records:
--
--   * 97_service_role.sql grants with GRANT ... ON ALL TABLES IN SCHEMA, which
--     Postgres evaluates AT GRANT TIME, and there is no ALTER DEFAULT
--     PRIVILEGES anywhere. A table created after it has NO privileges at all.
--   * 98_column_locks.sql runs BEFORE incr/, so its REVOKE would fire against a
--     table that does not exist yet and db-init would die.
--
-- Therefore the grants and the column locks for these tables live HERE, in the
-- same file that creates them. check-incr-grants.mjs enforces the first half.
--
-- Idempotent throughout.

CREATE SCHEMA IF NOT EXISTS yucer_field;

-- ===========================================================================
-- interaction - one real contact with a customer.
-- ===========================================================================
-- Evidence columns are FROZEN after creation, the same way yucer_pipeline.signal
-- freezes its evidence: what was said on a date is a fact later judgements cite,
-- and a citation that can be edited underneath is not provenance.
--
-- raw_note is kept VERBATIM and is never rewritten by a later interpretation.
-- summary may be agent-drafted; raw_note may not.
CREATE TABLE IF NOT EXISTS yucer_field.interaction (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                      -- [ref] isolation key
  account_id      UUID NOT NULL,
  opportunity_id  UUID,                               -- the deal it was for, if any
  project_id      UUID,                               -- the delivery it was for, if any
  channel         VARCHAR(32) NOT NULL
                    CONSTRAINT chk_interaction_channel
                    CHECK (channel IN ('meeting', 'call', 'visit', 'email', 'im', 'event', 'other')),
  direction       VARCHAR(16) NOT NULL DEFAULT 'outbound'
                    CONSTRAINT chk_interaction_direction
                    CHECK (direction IN ('outbound', 'inbound')),
  occurred_at     TIMESTAMPTZ NOT NULL,               -- evidence, immutable
  actor_sub       VARCHAR(128) NOT NULL,              -- [ref] who on our side
  subject         VARCHAR(255),
  raw_note        TEXT NOT NULL,                      -- evidence, immutable, verbatim
  summary         TEXT,
  capture_mode    VARCHAR(32) NOT NULL DEFAULT 'manual'
                    CONSTRAINT chk_interaction_capture
                    CHECK (capture_mode IN ('manual', 'dictated', 'pasted', 'agent_drafted')),
  -- A correction is a NEW row pointing at the old one. There is no UPDATE on
  -- the evidence columns, so "we got the date wrong" is recorded, not erased.
  corrects_interaction_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_interaction_corrects_self CHECK (corrects_interaction_id <> id),
  CONSTRAINT fk_interaction_account FOREIGN KEY (account_id)
    REFERENCES yucer_core.account (id) ON DELETE CASCADE,
  CONSTRAINT fk_interaction_opportunity FOREIGN KEY (opportunity_id)
    REFERENCES yucer_pipeline.opportunity (id) ON DELETE SET NULL,
  CONSTRAINT fk_interaction_project FOREIGN KEY (project_id)
    REFERENCES yucer_delivery.project (id) ON DELETE SET NULL,
  CONSTRAINT fk_interaction_corrects FOREIGN KEY (corrects_interaction_id)
    REFERENCES yucer_field.interaction (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_interaction_ws_account_at
  ON yucer_field.interaction (workspace_id, account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_ws_opportunity_at
  ON yucer_field.interaction (workspace_id, opportunity_id, occurred_at DESC)
  WHERE opportunity_id IS NOT NULL;

-- ===========================================================================
-- interaction_participant - who was actually in the room.
-- ===========================================================================
-- The question this exists to answer is NOT "is there an economic buyer on
-- file" - health.ts already answers that from a hand-typed decision_role. It is
-- "has anyone here ever MET them, and when". Those are different facts and only
-- the second one moves a deal.
--
-- external_name carries someone not yet a contact: the person who walked into
-- the meeting unannounced is exactly the one worth recording.
CREATE TABLE IF NOT EXISTS yucer_field.interaction_participant (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                      -- [ref]
  interaction_id  UUID NOT NULL,
  contact_id      UUID,                               -- them, if a known contact
  member_sub      VARCHAR(128),                       -- [ref] us
  external_name   VARCHAR(255),                       -- them, not yet a contact
  role_at_time    VARCHAR(32),                        -- their role as understood THEN
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A participant is one of the three, never none of them.
  CONSTRAINT chk_participant_identified
    CHECK (contact_id IS NOT NULL OR member_sub IS NOT NULL OR external_name IS NOT NULL),
  CONSTRAINT fk_participant_interaction FOREIGN KEY (interaction_id)
    REFERENCES yucer_field.interaction (id) ON DELETE CASCADE,
  CONSTRAINT fk_participant_contact FOREIGN KEY (contact_id)
    REFERENCES yucer_core.contact (id) ON DELETE SET NULL,
  CONSTRAINT uidx_participant_edge UNIQUE (interaction_id, contact_id, member_sub, external_name)
);

CREATE INDEX IF NOT EXISTS idx_participant_ws_contact
  ON yucer_field.interaction_participant (workspace_id, contact_id)
  WHERE contact_id IS NOT NULL;

-- ===========================================================================
-- commitment - a dated promise, in either direction.
-- ===========================================================================
-- The most predictive stall signal in B2B is a customer who has missed two
-- promises, and it is completely invisible in the existing 34 tables.
--
-- The rule that makes it worth having: a commitment CANNOT be closed by saying
-- it was done. `met` requires closure evidence - a real interaction or a real
-- stage event. Anything else is `waived`, which requires a reason and a name.
-- A "next step" that can be ticked off by its owner is not an obligation.
CREATE TABLE IF NOT EXISTS yucer_field.commitment (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL,                -- [ref]
  account_id            UUID NOT NULL,
  opportunity_id        UUID,
  origin_interaction_id UUID,                         -- the conversation it came from
  direction             VARCHAR(16) NOT NULL
                          CONSTRAINT chk_commitment_direction
                          CHECK (direction IN ('we_owe', 'they_owe')),
  statement             TEXT NOT NULL,                -- frozen: what was promised
  owner_sub             VARCHAR(128),                 -- [ref] ours, when we_owe
  counterpart_contact_id UUID,                        -- theirs, when they_owe
  due_at                TIMESTAMPTZ NOT NULL,
  status                VARCHAR(32) NOT NULL DEFAULT 'open'
                          CONSTRAINT chk_commitment_status
                          CHECK (status IN ('open', 'met', 'missed', 'waived')),
  closure_evidence_kind VARCHAR(32)
                          CONSTRAINT chk_commitment_closure_kind
                          CHECK (closure_evidence_kind IS NULL
                                 OR closure_evidence_kind IN ('interaction', 'stage_event')),
  closure_evidence_id   UUID,
  met_at                TIMESTAMPTZ,
  waived_by_sub         VARCHAR(128),                 -- [ref]
  waive_reason          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- `met` is not assertable. It requires something that happened.
  CONSTRAINT chk_commitment_met_needs_evidence
    CHECK (status <> 'met' OR (closure_evidence_kind IS NOT NULL AND closure_evidence_id IS NOT NULL)),
  -- Waiving is a decision, so it carries a decider and a reason.
  CONSTRAINT chk_commitment_waive_needs_reason
    CHECK (status <> 'waived' OR (waived_by_sub IS NOT NULL AND waive_reason IS NOT NULL)),
  CONSTRAINT fk_commitment_account FOREIGN KEY (account_id)
    REFERENCES yucer_core.account (id) ON DELETE CASCADE,
  CONSTRAINT fk_commitment_opportunity FOREIGN KEY (opportunity_id)
    REFERENCES yucer_pipeline.opportunity (id) ON DELETE SET NULL,
  CONSTRAINT fk_commitment_interaction FOREIGN KEY (origin_interaction_id)
    REFERENCES yucer_field.interaction (id) ON DELETE SET NULL,
  CONSTRAINT fk_commitment_contact FOREIGN KEY (counterpart_contact_id)
    REFERENCES yucer_core.contact (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_commitment_ws_due
  ON yucer_field.commitment (workspace_id, due_at)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_commitment_ws_account
  ON yucer_field.commitment (workspace_id, account_id, due_at DESC);

-- ===========================================================================
-- Service-role grants - HERE, not in 97, because 97 already ran (ADR-006).
-- ===========================================================================
GRANT USAGE ON SCHEMA yucer_field TO yucer_svc;

GRANT SELECT, INSERT ON yucer_field.interaction TO yucer_svc;
GRANT SELECT, INSERT ON yucer_field.interaction_participant TO yucer_svc;
GRANT SELECT, INSERT ON yucer_field.commitment TO yucer_svc;

-- DELETE is deliberately NOT granted on the evidence tables.
--
-- "Append-only" elsewhere in this repo means "no UPDATE", and 97 hands out
-- DELETE ON ALL TABLES with no REVOKE anywhere - so append-only has so far been
-- a statement about UPDATE only. The audit value of this plane comes precisely
-- from rows not disappearing: a judgement citing "what the customer said on
-- 4 March" is worthless if that row can be removed. A privacy erasure is an
-- operator action through db-init, deliberate and logged, not something the
-- product's own service role can do.

-- ===========================================================================
-- Column locks - HERE, not in 98, because 98 already ran (ADR-006).
-- ===========================================================================
-- interaction / interaction_participant: no UPDATE at all. Evidence is frozen,
-- and a correction is a new row pointing at the old one.
REVOKE UPDATE ON yucer_field.interaction FROM yucer_svc;
REVOKE UPDATE ON yucer_field.interaction_participant FROM yucer_svc;

-- commitment: only the lifecycle moves. statement, direction, due_at and the
-- origin are the promise itself - editing them turns a missed commitment into a
-- met one by rewriting what was promised.
REVOKE UPDATE ON yucer_field.commitment FROM yucer_svc;
GRANT UPDATE (status, closure_evidence_kind, closure_evidence_id, met_at,
              waived_by_sub, waive_reason, updated_at)
  ON yucer_field.commitment TO yucer_svc;
