-- 0098_agent_briefing_next_action_kind.sql - 下一步最佳动作 runs through the
-- one door (deal batch 8c, YC-066 S6).
--
-- One dated action for the deal, its reason naming an unmet exit criterion or
-- the stall point, filed as a proposal a person decides. Written when the deal
-- page is opened and the deal's data has changed since the last run (owner
-- 2026-09-28: on open, not a daily sweep) - the same inputs again are the
-- earlier run, no second model call and no second charge (runAdvisor,
-- incr/0083). Its runs are kind 'next_action'.
--
-- Idempotent: the constraint is dropped and recreated with the wider list.

ALTER TABLE yucer_agent.agent_briefing DROP CONSTRAINT IF EXISTS chk_agent_briefing_kind;
ALTER TABLE yucer_agent.agent_briefing ADD CONSTRAINT chk_agent_briefing_kind CHECK (kind IN (
  'situation', 'risk_explain', 'meeting_pack', 'review_draft', 'forecast_brief', 'consistency_check',
  'evidence_extract', 'plan_draft', 'price_advice', 'next_action'
));
