-- 0094_competition.sql - 竞争位置: competitors as data, decision criteria line by line.
-- Design: YC-067 section 09 (numbered 0089 there - numbers were tentative,
-- "以合并顺序为准"), YC-065 R4 竞争位置.
--
-- WHY TABLES AND NOT A TEXT FIELD. 竞争位置 answers four questions: who the
-- rivals are, who shaped the decision criteria, whether we meet each one, and
-- how often we have beaten this rival before. A paragraph of free text cannot
-- answer the middle two, and the last one needs a rival's NAME normalised - the
-- same company written three ways makes the win rate uncomputable. So rivals
-- are a workspace vocabulary (data, never hard-coded - the 0090 principle).
--
-- NOT DONE HERE (design: "不做"): a competitive-intelligence library,
-- battlecards, a rival product catalogue. Those belong to a CI system, not to
-- the deal page. Rival MOMENTUM (mentions in the last 30 days) and the
-- historical WIN RATE are computed at read time, never stored.
--
-- Idempotent throughout.

-- --- the workspace's rivals (no factory seed: a vendor list is not ours to ship)
CREATE TABLE IF NOT EXISTS yucer_pipeline.competitor (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                          -- [ref] isolation key
  name          VARCHAR(128) NOT NULL,
  aliases       TEXT[] NOT NULL DEFAULT '{}',           -- other spellings, for matching
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_competitor_name UNIQUE (workspace_id, name)
);

-- --- who is competing on THIS deal - append-only, versioned like 0085 evidence:
-- a rival dropping out is a new row (present = false), never an edit, so the
-- review can answer when we learned who we were up against.
CREATE TABLE IF NOT EXISTS yucer_pipeline.opportunity_competitor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  opportunity_id  UUID NOT NULL REFERENCES yucer_pipeline.opportunity (id) ON DELETE CASCADE,
  -- NULL = confirmed "only us" - a fact, distinct from "nobody recorded yet".
  competitor_id   UUID REFERENCES yucer_pipeline.competitor (id) ON DELETE RESTRICT,
  is_incumbent    BOOLEAN NOT NULL DEFAULT false,         -- the current supplier
  present         BOOLEAN NOT NULL DEFAULT true,          -- false = out of the running
  interaction_id  UUID REFERENCES yucer_field.interaction (id) ON DELETE SET NULL,  -- the basis
  source          VARCHAR(16) NOT NULL DEFAULT 'manual',
  proposal_id     UUID,
  author_sub      VARCHAR(128) NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_opportunity_competitor_source CHECK (source IN ('manual', 'model_accepted')),
  -- A model-proposed entry names the proposal that was accepted (the 0085 rule).
  CONSTRAINT chk_opportunity_competitor_proposal CHECK (source <> 'model_accepted' OR proposal_id IS NOT NULL),
  -- "Only us" cannot be an incumbent, and cannot drop out.
  CONSTRAINT chk_opportunity_competitor_only_us CHECK (competitor_id IS NOT NULL OR (NOT is_incumbent AND present))
);
CREATE INDEX IF NOT EXISTS idx_opportunity_competitor_opp
  ON yucer_pipeline.opportunity_competitor (workspace_id, opportunity_id, recorded_at);

-- --- the buyer's decision criteria, one row each
CREATE TABLE IF NOT EXISTS yucer_pipeline.opportunity_criterion (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  opportunity_id  UUID NOT NULL REFERENCES yucer_pipeline.opportunity (id) ON DELETE CASCADE,
  statement       TEXT NOT NULL,
  -- who wrote the criterion: us (we shaped it), the buyer, a tender document, unknown
  shaped_by       VARCHAR(8) NOT NULL DEFAULT 'unknown',
  fit             VARCHAR(8),                              -- NULL = not assessed
  fit_note        VARCHAR(255),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  updated_by_sub  VARCHAR(128),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_opportunity_criterion_shaped_by CHECK (shaped_by IN ('us', 'buyer', 'rfp', 'unknown')),
  CONSTRAINT chk_opportunity_criterion_fit CHECK (fit IS NULL OR fit IN ('met', 'partial', 'unmet')),
  CONSTRAINT chk_opportunity_criterion_statement CHECK (length(btrim(statement)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_opportunity_criterion_opp
  ON yucer_pipeline.opportunity_criterion (workspace_id, opportunity_id, sort_order);

-- --- a review names the rival it was lost (or won) against, by row
ALTER TABLE yucer_pipeline.win_loss_review
  ADD COLUMN IF NOT EXISTS competitor_id UUID REFERENCES yucer_pipeline.competitor (id) ON DELETE RESTRICT;

-- Backfill: the free-text competitor names already on reviews become vocabulary
-- rows (trimmed, de-duplicated per workspace), and each review points at its
-- exact match. The text column stays as history and is no longer written.
INSERT INTO yucer_pipeline.competitor (workspace_id, name)
SELECT DISTINCT r.workspace_id, btrim(r.competitor)
  FROM yucer_pipeline.win_loss_review r
 WHERE r.competitor IS NOT NULL AND btrim(r.competitor) <> ''
ON CONFLICT (workspace_id, name) DO NOTHING;

UPDATE yucer_pipeline.win_loss_review r
   SET competitor_id = c.id
  FROM yucer_pipeline.competitor c
 WHERE r.competitor_id IS NULL
   AND c.workspace_id = r.workspace_id
   AND c.name = btrim(r.competitor);

-- --- grants (a new table carries its own; see incr/README) --------------------
GRANT SELECT, INSERT, DELETE ON yucer_pipeline.competitor TO yucer_svc;
REVOKE UPDATE ON yucer_pipeline.competitor FROM yucer_svc;
GRANT UPDATE (name, aliases, sort_order, updated_at) ON yucer_pipeline.competitor TO yucer_svc;

-- Append-only: no UPDATE, no DELETE. A correction is a new version.
GRANT SELECT, INSERT ON yucer_pipeline.opportunity_competitor TO yucer_svc;
REVOKE UPDATE, DELETE ON yucer_pipeline.opportunity_competitor FROM yucer_svc;

GRANT SELECT, INSERT, DELETE ON yucer_pipeline.opportunity_criterion TO yucer_svc;
REVOKE UPDATE ON yucer_pipeline.opportunity_criterion FROM yucer_svc;
GRANT UPDATE (statement, shaped_by, fit, fit_note, sort_order, updated_by_sub, updated_at)
  ON yucer_pipeline.opportunity_criterion TO yucer_svc;

-- win_loss_review: competitor_id joins the writable set. Restated whole
-- (REVOKE resets, then the full grant - the 0039 shape).
REVOKE UPDATE ON yucer_pipeline.win_loss_review FROM yucer_svc;
GRANT UPDATE (outcome, primary_reason_id, competitor, competitor_id, lessons, reviewer_sub, reviewed_at, updated_at)
  ON yucer_pipeline.win_loss_review TO yucer_svc;
