-- 0027_opportunity_contact.sql - a buying role belongs to a deal.
--
-- Authority: ADR-024, batch D, on the ADR accepted 2026-09-04.
--
-- THE DEFECT. decision_role's values are the Miller-Heiman classification, and
-- in that method the role is per-deal by definition: the same person can be the
-- economic buyer on one purchase and a user on the next. This repo stored it as
-- a global property of the person, and analyzeChain() did not even take an
-- opportunity - so the decision chain was computed PER CUSTOMER.
--
-- The product already knew roles are situational: interaction_participant has
-- role_at_time - what somebody was in THAT room. The concept existed at the
-- interaction layer and was missing at the layer where money changes hands.
--
-- ADR-024's draft claimed the defect was already visible in the demo data,
-- naming three concurrent deals at acc_demo_2. It was not: only one of those
-- three is open, and no account in the seed had two open deals at once, so the
-- defect could not be shown there at all. The seed now gives acc_demo_2 a
-- second open deal with different roles on each, which is how a demo earns the
-- right to be cited.
--
-- yucer_pipeline, NOT yucer_core. ADR-001: one object, one owning partition,
-- and this row is about a DEAL's buying committee - D6. The foreign key into
-- yucer_core.person crosses schemas, which is already the shape of
-- fk_commitment_contact.
--
-- person.decision_role AND person.influence GO, in the same increment. An
-- earlier draft of this change kept them as a customer-level default that a
-- deal fell back to, on the argument that dropping them would destroy roles on
-- customers with no open deal. That argument was about DATA THAT DOES NOT
-- EXIST: this product has no users, and every row today is seed data this
-- repository writes itself. A fallback that pays the cost ADR-024 named -
-- "把刚拆开的东西又粘回去" - to protect against a loss that cannot happen is
-- not a trade-off, it is just the old design with a second table beside it.
--
-- WHAT REPLACES THEM. Nothing, and that is the answer rather than a gap. A
-- buying role exists only relative to a purchase, so a customer with no open
-- deal HAS no buying committee - and saying so is true where the old column was
-- a guess with a schema behind it. What that customer does have is people with
-- job titles, which is person_affiliation and a different question.
--
-- NO BACKFILL either, for the same reason it is not needed: nobody has ever
-- stated a per-deal role, so there is nothing to carry forward. The demo seed
-- states them deal by deal, which is what a person would do.

CREATE TABLE IF NOT EXISTS yucer_pipeline.opportunity_contact (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref] isolation key
  opportunity_id UUID NOT NULL,
  person_id      UUID NOT NULL,
  -- The six Miller-Heiman roles. This is now the ONLY place the vocabulary
  -- lives - person.decision_role held the same list and is dropped at the foot
  -- of this file, so there is one definition rather than two that can drift.
  buying_role    VARCHAR(32) NOT NULL DEFAULT 'unknown'
                   CONSTRAINT chk_opportunity_contact_role
                   CHECK (buying_role IN ('economic', 'technical', 'user', 'coach', 'blocker', 'unknown')),
  influence      SMALLINT,                            -- 0-100, per deal
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_opportunity_contact_influence
    CHECK (influence IS NULL OR (influence BETWEEN 0 AND 100)),
  CONSTRAINT fk_opportunity_contact_opportunity FOREIGN KEY (opportunity_id)
    REFERENCES yucer_pipeline.opportunity (id) ON DELETE CASCADE,
  CONSTRAINT fk_opportunity_contact_person FOREIGN KEY (person_id)
    REFERENCES yucer_core.person (id) ON DELETE CASCADE
);

-- ONE ROW PER PERSON PER DEAL. Two rows would mean two answers to "what is she
-- on this deal", and the chain walk would have to pick one - silently, and
-- differently depending on row order.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_opportunity_contact_pair
  ON yucer_pipeline.opportunity_contact (opportunity_id, person_id);

-- "the buying committee for this deal" is the query this table exists for.
CREATE INDEX IF NOT EXISTS idx_opportunity_contact_ws_opp
  ON yucer_pipeline.opportunity_contact (workspace_id, opportunity_id);
-- and its inverse: "which deals is this person on", for the person view.
CREATE INDEX IF NOT EXISTS idx_opportunity_contact_ws_person
  ON yucer_pipeline.opportunity_contact (workspace_id, person_id);

-- A table created by an increment has NO privileges: 97's GRANT ON ALL TABLES
-- is evaluated at grant time and never saw this one. check-incr-grants.mjs
-- enforces that the grant lives in the same file.
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_pipeline.opportunity_contact TO yucer_svc;
REVOKE UPDATE ON yucer_pipeline.opportunity_contact FROM yucer_svc;
-- opportunity_id and person_id are the edge. Re-pointing this row at a
-- different deal or a different person is not an edit of anything - it is a
-- different fact, and it is a DELETE plus an INSERT.
GRANT UPDATE (buying_role, influence, is_primary, updated_at)
  ON yucer_pipeline.opportunity_contact TO yucer_svc;

-- --- and the columns that pretended a person had a role ---------------------
--
-- The CHECK constraints go with the columns; naming them would fail on a rerun.
ALTER TABLE yucer_core.person
  DROP COLUMN IF EXISTS decision_role,
  DROP COLUMN IF EXISTS influence;

-- Restated without them: a GRANT naming a dropped column is an error, so this
-- is not tidying.
REVOKE UPDATE ON yucer_core.person FROM yucer_svc;
GRANT UPDATE (name, email, mobile, wechat, status, updated_at, deleted_at)
  ON yucer_core.person TO yucer_svc;
