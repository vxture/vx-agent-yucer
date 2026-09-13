-- 0057_stage_definition.sql - 商机阶段成为工作区自己的词表。
--
-- Authority: owner, 2026-09-13, 商机配置整合批: 商机阶段要能改名/排序/改默认
-- 赢率/增删，不再是写死的七个字面量.
--
-- WHAT IT WAS: chk_opportunity_stage CHECK (stage IN (七个字面量)), and the
-- same seven baked into domains/pipeline/lib/stage.ts's DEFAULT_PROBABILITY /
-- TERMINAL_STAGES / OPEN_STAGE_ORDER. Renaming a stage, changing its default
-- win rate, reordering the funnel, or adding one needed a release.
--
-- NATURAL KEY, NOT A SURROGATE JOIN (unlike 0039/0040's reason_id/industry_id
-- pattern). opportunity.stage and opportunity_stage_event.{from,to}_stage are
-- VARCHAR(32) codes the rule layer and half the UI already compare, filter
-- and index by string; a UUID join would touch every one of those sites for
-- no integrity gain a composite FK does not already give. The FK itself is
-- added in 0058, once this table exists and is seeded.
--
-- won/lost STOP BEING LITERALS AND START BEING FLAGS. is_won/is_terminal
-- replace the `stage === "won"` / `stage === "lost"` comparisons the rule
-- layer used to make directly. opportunity.status is UNCHANGED - 'open'/
-- 'won'/'lost'/'abandoned' stays a fixed CHECK, the same way 0039's
-- win_loss_review.outcome stayed a CHECK ("won/lost is a state the rule layer
-- branches on... OUTCOME STAYS A CHECK"). Status is the state machine; a
-- stage's CODE and LABEL are now the workspace's data, but which flag a code
-- carries is still a fact the product enforces via the CHECK constraints
-- below, not something a rename can quietly flip.
--
-- TERMINAL PROBABILITIES STAY ABSOLUTE. stage.ts's own comment already
-- promised "a won deal is 100% and a lost one is 0% whatever anyone typed
-- earlier" - chk_stage_definition_won_probability/_lost_probability keep that
-- true at the database layer too. Only an OPEN stage's default_probability is
-- freely editable.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_pipeline.stage_definition (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL,                    -- [ref] isolation key
  stage_code           VARCHAR(32) NOT NULL,              -- anchor, immutable
  name                 VARCHAR(64) NOT NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  default_probability  SMALLINT NOT NULL DEFAULT 0,
  is_won               BOOLEAN NOT NULL DEFAULT FALSE,
  is_terminal          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_stage_definition_code UNIQUE (workspace_id, stage_code),
  CONSTRAINT chk_stage_definition_probability
    CHECK (default_probability BETWEEN 0 AND 100),
  -- Won implies terminal - a deal cannot be "won" and still open.
  CONSTRAINT chk_stage_definition_won_terminal CHECK (NOT is_won OR is_terminal),
  CONSTRAINT chk_stage_definition_won_probability
    CHECK (NOT is_won OR default_probability = 100),
  CONSTRAINT chk_stage_definition_lost_probability
    CHECK (NOT (is_terminal AND NOT is_won) OR default_probability = 0)
);

CREATE INDEX IF NOT EXISTS idx_stage_definition_ws_sort
  ON yucer_pipeline.stage_definition (workspace_id, sort_order);

-- The shipped seven, for every workspace that already has an opportunity -
-- same codes/names/probabilities/order/is_won/is_terminal stage.ts has today,
-- so a workspace that never opens the new config page sees nothing change. A
-- workspace with zero opportunities gets no row here (there is nothing to
-- join DISTINCT workspace_id FROM opportunity against) - covered instead by
-- the service's own first-contact seeding (listStageDefinitions), the same
-- fallback listWinLossReasons/listIndustries already rely on.
INSERT INTO yucer_pipeline.stage_definition
  (workspace_id, stage_code, name, sort_order, default_probability, is_won, is_terminal)
SELECT w.workspace_id, v.code, v.name, v.ord, v.prob, v.won, v.terminal
  FROM (SELECT DISTINCT workspace_id FROM yucer_pipeline.opportunity) w
 CROSS JOIN (VALUES
   ('qualify',   '合格判定', 1, 10,  FALSE, FALSE),
   ('discover',  '需求挖掘', 2, 25,  FALSE, FALSE),
   ('validate',  '方案验证', 3, 50,  FALSE, FALSE),
   ('propose',   '报价投标', 4, 70,  FALSE, FALSE),
   ('negotiate', '商务谈判', 5, 90,  FALSE, FALSE),
   ('won',       '赢单',    6, 100, TRUE,  TRUE),
   ('lost',      '丢单',    7, 0,   FALSE, TRUE)
 ) AS v(code, name, ord, prob, won, terminal)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_pipeline.stage_definition d WHERE d.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, stage_code) DO NOTHING;

-- --- grants -----------------------------------------------------------------
-- DELETE is granted (unlike the pure vocabularies) because a stage CAN be
-- removed - gated by the service's own planStageRemoval, backstopped by
-- 0058's FK (ON DELETE RESTRICT) for any stage still referenced by an
-- opportunity or its journal.
GRANT SELECT, INSERT, DELETE ON yucer_pipeline.stage_definition TO yucer_svc;
-- stage_code is the anchor - locked, like every other vocabulary's code.
GRANT UPDATE (name, sort_order, default_probability, is_won, is_terminal, updated_at)
  ON yucer_pipeline.stage_definition TO yucer_svc;
