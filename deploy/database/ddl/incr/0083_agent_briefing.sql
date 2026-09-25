-- 0083_agent_briefing.sql - 参谋生成缓存 (deal batch 0b, D8).
-- Design: YC-067 §07 (numbered 0087 there - the design's 0082-0090 were
-- tentative, "以合并顺序为准"), YC-042 §04 (yucer.advisor.runs).
--
-- ONE ROW = ONE ADVISOR RUN THAT REACHED THE MODEL, keyed by what it was
-- asked. runAdvisor() fingerprints the input (capability, subject, the input
-- itself); the same fingerprint again is a cache hit - no model call, no
-- charge (YC-042: "输入没变就命中缓存: 不调模型, 不计量"). The run id the
-- usage event carries is derived from the same fingerprint, so a retried or
-- concurrent run of one input is one event on the platform, too.
--
-- A CACHE, NOT A FACT. Dropping the table loses no business information, it
-- only makes the next run call the model again - which is why the service
-- role may DELETE (stale fingerprints are evicted) but never UPDATE: a
-- generation is what the model said, and rewriting it would make the cited
-- text disagree with the run that produced it.
--
-- WIDER THAN THE DESIGN BY ONE SUBJECT AND ONE KIND (named for veto in the
-- PR): YC-067 listed deal / forecast subjects and five brief kinds. The one
-- advisor that already calls the model - 说法核对, a customer's conflicting
-- statements - is 'account' / 'consistency_check'; without them the only
-- live model run could not go through the one door.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_agent.agent_briefing (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  subject_type  VARCHAR(16) NOT NULL,
  subject_id    VARCHAR(128) NOT NULL,                -- a deal / customer id, or a forecast scope key
  kind          VARCHAR(24) NOT NULL,
  capability    VARCHAR(64) NOT NULL,                 -- the ADR-015 key it ran under
  input_hash    VARCHAR(64) NOT NULL,                 -- sha-256 hex of the canonical input
  content       JSONB NOT NULL,                       -- what came back: paragraphs + citations, or a result summary
  model         VARCHAR(64) NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_agent_briefing_subject CHECK (subject_type IN ('opportunity', 'forecast_scope', 'account')),
  CONSTRAINT chk_agent_briefing_kind CHECK (kind IN (
    'situation', 'risk_explain', 'meeting_pack', 'review_draft', 'forecast_brief', 'consistency_check'
  )),
  CONSTRAINT chk_agent_briefing_hash CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT uidx_agent_briefing UNIQUE (workspace_id, subject_type, subject_id, kind, input_hash)
);

-- The page reads the latest row for a subject and kind.
CREATE INDEX IF NOT EXISTS idx_agent_briefing_latest
  ON yucer_agent.agent_briefing (workspace_id, subject_type, subject_id, kind, generated_at DESC);

GRANT SELECT, INSERT, DELETE ON yucer_agent.agent_briefing TO yucer_svc;
REVOKE UPDATE ON yucer_agent.agent_briefing FROM yucer_svc;
