-- 0086_agent_briefing_evidence_kind.sql - 证据抽取 runs through the one door
-- (deal batch 4b, YC-066 §04).
--
-- runAdvisor caches every run that reached the model under its input
-- fingerprint (incr/0083). Evidence extraction reads ONE new follow-up
-- against what the slots already say; the same note run twice is the earlier
-- answer - no second model call, no second charge. Its runs are kind
-- 'evidence_extract', which the 0083 CHECK does not yet admit.
--
-- Idempotent: the constraint is dropped and recreated with the wider list.

ALTER TABLE yucer_agent.agent_briefing DROP CONSTRAINT IF EXISTS chk_agent_briefing_kind;
ALTER TABLE yucer_agent.agent_briefing ADD CONSTRAINT chk_agent_briefing_kind CHECK (kind IN (
  'situation', 'risk_explain', 'meeting_pack', 'review_draft', 'forecast_brief', 'consistency_check',
  'evidence_extract'
));
