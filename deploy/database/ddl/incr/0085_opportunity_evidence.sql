-- 0085_opportunity_evidence.sql - 购买证据槽 (deal batch 4a).
-- Design: YC-067 §04 (numbered 0084 there - the design's 0082-0090 were
-- tentative, "以合并顺序为准"), YC-065 R1/R4, YC-069 §04c/§07.
--
-- WHAT WE KNOW ABOUT WHY AND HOW THEY BUY, one slot at a time:
--   pain              - what hurts
--   metrics           - the quantified value
--   status_quo        - "再等等 / 预算冻结 / 先不做": the pull of doing nothing,
--                       today's most common reason a deal is lost
--   decision_process  - how they decide
--   paper_process     - how they sign
-- 决策标准 and competitors are NOT here: they are itemised and cite the
-- competitor vocabulary (YC-067 §09, a later increment).
--
-- VERSIONS, NOT OVERWRITES. Append-only; the page reads the latest row per
-- slot. A review has to answer "on which day did we learn how they decide",
-- which needs the history. An empty statement is a version too: clearing.
--
-- GROUNDED OR SAID. interaction_id cites the follow-up the statement comes
-- from; the page shows 有据 with a citation and 口述 without. Both count as
-- filled - the difference is reported, not scored.
--
-- WHO. author_sub is the person who wrote it, or - when a model proposal was
-- accepted - the person who accepted it; proposal_id then names the proposal
-- and is required.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_pipeline.opportunity_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                       -- [ref] isolation key
  opportunity_id  UUID NOT NULL,
  slot            VARCHAR(24) NOT NULL,
  statement       TEXT NOT NULL,                       -- '' = cleared (a version too)
  interaction_id  UUID,                                -- the follow-up it cites
  author_sub      VARCHAR(128) NOT NULL,
  source          VARCHAR(16) NOT NULL DEFAULT 'manual',
  proposal_id     UUID,                                -- [ref] yucer_agent.agent_action when accepted from a model
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_evidence_slot CHECK (slot IN ('pain', 'metrics', 'status_quo', 'decision_process', 'paper_process')),
  CONSTRAINT chk_evidence_source CHECK (source IN ('manual', 'model_accepted')),
  CONSTRAINT chk_evidence_proposal CHECK (source <> 'model_accepted' OR proposal_id IS NOT NULL),
  CONSTRAINT chk_evidence_length CHECK (char_length(statement) <= 2000),
  CONSTRAINT fk_evidence_opportunity FOREIGN KEY (opportunity_id)
    REFERENCES yucer_pipeline.opportunity (id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_interaction FOREIGN KEY (interaction_id)
    REFERENCES yucer_field.interaction (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_latest
  ON yucer_pipeline.opportunity_evidence (workspace_id, opportunity_id, slot, recorded_at DESC);

GRANT SELECT, INSERT ON yucer_pipeline.opportunity_evidence TO yucer_svc;
REVOKE UPDATE, DELETE ON yucer_pipeline.opportunity_evidence FROM yucer_svc;
