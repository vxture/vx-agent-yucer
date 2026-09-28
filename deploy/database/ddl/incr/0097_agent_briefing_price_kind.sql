-- 0097_agent_briefing_price_kind.sql - 价格参谋 runs through the one door
-- (deal batch 10b, YC-066 S4).
--
-- A pricing advice reads the deal's concession sheet (list, floor, quote -
-- the rule's own numbers) and its follow-ups; the same inputs again are the
-- earlier advice - no second model call, no second charge (runAdvisor,
-- incr/0083). Its runs are kind 'price_advice'.
--
-- Idempotent: the constraint is dropped and recreated with the wider list.

ALTER TABLE yucer_agent.agent_briefing DROP CONSTRAINT IF EXISTS chk_agent_briefing_kind;
ALTER TABLE yucer_agent.agent_briefing ADD CONSTRAINT chk_agent_briefing_kind CHECK (kind IN (
  'situation', 'risk_explain', 'meeting_pack', 'review_draft', 'forecast_brief', 'consistency_check',
  'evidence_extract', 'plan_draft', 'price_advice'
));
