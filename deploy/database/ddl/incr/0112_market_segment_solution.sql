-- Market defaults are independent from each strategy's saved selection.
BEGIN;
CREATE TABLE IF NOT EXISTS yucer_gtm.market_segment_solution (
  workspace_id UUID NOT NULL,
  segment_id UUID NOT NULL,
  solution_id UUID NOT NULL,
  PRIMARY KEY (workspace_id, segment_id, solution_id),
  CONSTRAINT fk_segment_solution_market FOREIGN KEY (workspace_id, segment_id)
    REFERENCES yucer_gtm.market_segment (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_segment_solution_catalog FOREIGN KEY (workspace_id, solution_id)
    REFERENCES yucer_catalog.solution (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_segment_solution_catalog ON yucer_gtm.market_segment_solution (workspace_id, solution_id);

-- Adopt explicit live market-level selections once; never infer defaults from
-- a strategy's shared supply or from a draft/closed/historical publication.
INSERT INTO yucer_gtm.market_segment_solution (workspace_id, segment_id, solution_id)
SELECT DISTINCT m.workspace_id, m.segment_id, m.solution_id
FROM yucer_gtm.strategy_plan_market_solution m
JOIN yucer_gtm.strategy_plan p ON p.workspace_id=m.workspace_id AND p.id=m.plan_id
JOIN yucer_catalog.solution s ON s.workspace_id=m.workspace_id AND s.id=m.solution_id
WHERE p.status IN ('active', 'approved') AND s.status='active'
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, DELETE ON yucer_gtm.market_segment_solution TO yucer_svc;
REVOKE UPDATE ON yucer_gtm.market_segment_solution FROM yucer_svc;
COMMIT;
