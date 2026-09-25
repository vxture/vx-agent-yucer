-- 0091_deal_score_weight.sql - 商机评估分's weights become the workspace's own.
--
-- Authority: owner, 2026-09-25 - "100分，设计一套加权计算逻辑，参数调整放到
-- admin板块". The score is a weighted average of seven factors, each 0-100
-- (domains/pipeline/lib/deal-score.ts); this row holds the weights and the
-- three scoring knobs, edited in /admin/opportunity.
--
-- ONE ROW PER WORKSPACE, keyed by workspace_id (0041's shape): a settings row
-- is not a list. NO DELETE: "back to ours" is an UPDATE to the defaults; a
-- missing row reads as the defaults, which carry the same numbers.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_pipeline.deal_score_weight (
  workspace_id    UUID PRIMARY KEY,                     -- [ref] isolation key
  w_exit          SMALLINT NOT NULL DEFAULT 20,         -- 退出条件完成度
  w_chain         SMALLINT NOT NULL DEFAULT 20,         -- 决策链
  w_stage         SMALLINT NOT NULL DEFAULT 15,         -- 推进节奏
  w_recency       SMALLINT NOT NULL DEFAULT 15,         -- 互动新鲜度
  w_commitment    SMALLINT NOT NULL DEFAULT 10,         -- 承诺履约
  w_forecast      SMALLINT NOT NULL DEFAULT 10,         -- 预测一致
  w_price         SMALLINT NOT NULL DEFAULT 10,         -- 价格纪律
  watch_score     SMALLINT NOT NULL DEFAULT 50,         -- what a 关注 verdict scores
  recent_days     SMALLINT NOT NULL DEFAULT 14,         -- touched within = 100
  quiet_days      SMALLINT NOT NULL DEFAULT 45,         -- quiet this long = 0
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_deal_score_weight_each CHECK (
    w_exit BETWEEN 0 AND 100 AND w_chain BETWEEN 0 AND 100 AND w_stage BETWEEN 0 AND 100
    AND w_recency BETWEEN 0 AND 100 AND w_commitment BETWEEN 0 AND 100
    AND w_forecast BETWEEN 0 AND 100 AND w_price BETWEEN 0 AND 100),
  -- The property of the SET, which no single column's CHECK can say: a
  -- weighted average whose weights do not add up is a different formula.
  CONSTRAINT chk_deal_score_weight_sum CHECK (
    w_exit + w_chain + w_stage + w_recency + w_commitment + w_forecast + w_price = 100),
  CONSTRAINT chk_deal_score_weight_watch CHECK (watch_score BETWEEN 1 AND 99),
  CONSTRAINT chk_deal_score_weight_days CHECK (
    recent_days BETWEEN 1 AND 365 AND quiet_days > recent_days AND quiet_days <= 365)
);

INSERT INTO yucer_pipeline.deal_score_weight (workspace_id)
SELECT DISTINCT workspace_id FROM yucer_pipeline.opportunity
ON CONFLICT (workspace_id) DO NOTHING;

GRANT SELECT, INSERT ON yucer_pipeline.deal_score_weight TO yucer_svc;
REVOKE UPDATE ON yucer_pipeline.deal_score_weight FROM yucer_svc;
GRANT UPDATE (w_exit, w_chain, w_stage, w_recency, w_commitment, w_forecast, w_price,
              watch_score, recent_days, quiet_days, updated_at)
  ON yucer_pipeline.deal_score_weight TO yucer_svc;
