-- 0092_deal_score_five_dimensions.sql - 商机评估 has ONE set of dimensions.
--
-- Authority: owner, 2026-09-25/26 - "商机评估到底是几个维度，页面5个，admin 7个，
-- 这个是根本性错误" and "意图是销售人员能够直观的理解这些维度，找到工作差距". 0091
-- weighted seven rule factors while the page showed five rule cells; both
-- give way to the five sales dimensions of YC-065 R4, renamed by the owner:
--
--   w_value        需求价值   (R4 意向与价值)
--   w_consensus    买方共识
--   w_competition  竞争位置
--   w_engagement   互动热度   (R4 买方参与)
--   w_progress     推进节奏   (R4 成交推进)
--
-- 0091 has not reached any deployed database (production ledger 0081), but
-- it is a shipped increment and the ledger applies each file once, so the
-- reshape is its own file. The seven old columns go; the three knobs
-- (watch_score, recent_days, quiet_days) keep their meaning. Rows that exist
-- take the new defaults - nobody has tuned a seven-factor set.
--
-- Idempotent throughout.

ALTER TABLE yucer_pipeline.deal_score_weight DROP CONSTRAINT IF EXISTS chk_deal_score_weight_sum;
ALTER TABLE yucer_pipeline.deal_score_weight DROP CONSTRAINT IF EXISTS chk_deal_score_weight_each;

ALTER TABLE yucer_pipeline.deal_score_weight DROP COLUMN IF EXISTS w_exit;
ALTER TABLE yucer_pipeline.deal_score_weight DROP COLUMN IF EXISTS w_chain;
ALTER TABLE yucer_pipeline.deal_score_weight DROP COLUMN IF EXISTS w_stage;
ALTER TABLE yucer_pipeline.deal_score_weight DROP COLUMN IF EXISTS w_recency;
ALTER TABLE yucer_pipeline.deal_score_weight DROP COLUMN IF EXISTS w_commitment;
ALTER TABLE yucer_pipeline.deal_score_weight DROP COLUMN IF EXISTS w_forecast;
ALTER TABLE yucer_pipeline.deal_score_weight DROP COLUMN IF EXISTS w_price;

ALTER TABLE yucer_pipeline.deal_score_weight ADD COLUMN IF NOT EXISTS w_value SMALLINT NOT NULL DEFAULT 20;
ALTER TABLE yucer_pipeline.deal_score_weight ADD COLUMN IF NOT EXISTS w_consensus SMALLINT NOT NULL DEFAULT 25;
ALTER TABLE yucer_pipeline.deal_score_weight ADD COLUMN IF NOT EXISTS w_competition SMALLINT NOT NULL DEFAULT 10;
ALTER TABLE yucer_pipeline.deal_score_weight ADD COLUMN IF NOT EXISTS w_engagement SMALLINT NOT NULL DEFAULT 20;
ALTER TABLE yucer_pipeline.deal_score_weight ADD COLUMN IF NOT EXISTS w_progress SMALLINT NOT NULL DEFAULT 25;

ALTER TABLE yucer_pipeline.deal_score_weight ADD CONSTRAINT chk_deal_score_weight_each CHECK (
  w_value BETWEEN 0 AND 100 AND w_consensus BETWEEN 0 AND 100 AND w_competition BETWEEN 0 AND 100
  AND w_engagement BETWEEN 0 AND 100 AND w_progress BETWEEN 0 AND 100);
ALTER TABLE yucer_pipeline.deal_score_weight ADD CONSTRAINT chk_deal_score_weight_sum CHECK (
  w_value + w_consensus + w_competition + w_engagement + w_progress = 100);

-- Grants restated whole: the old weight columns went with their columns.
REVOKE UPDATE ON yucer_pipeline.deal_score_weight FROM yucer_svc;
GRANT UPDATE (w_value, w_consensus, w_competition, w_engagement, w_progress,
              watch_score, recent_days, quiet_days, updated_at)
  ON yucer_pipeline.deal_score_weight TO yucer_svc;
