-- 0089_agent_briefing_plan_kind.sql - 推进计划生成 runs through the one door
-- (deal batch 5c, YC-066 §04).
--
-- A plan draft reads the deal's unmet exit criteria and the promises already
-- open; the same inputs again are the earlier draft - no second model call,
-- no second charge (runAdvisor, incr/0083). Its runs are kind 'plan_draft'.
--
-- Idempotent: the constraint is dropped and recreated with the wider list.

ALTER TABLE yucer_agent.agent_briefing DROP CONSTRAINT IF EXISTS chk_agent_briefing_kind;
ALTER TABLE yucer_agent.agent_briefing ADD CONSTRAINT chk_agent_briefing_kind CHECK (kind IN (
  'situation', 'risk_explain', 'meeting_pack', 'review_draft', 'forecast_brief', 'consistency_check',
  'evidence_extract', 'plan_draft'
));
