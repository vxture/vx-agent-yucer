CREATE UNIQUE INDEX IF NOT EXISTS uidx_market_segment_ws_id ON yucer_gtm.market_segment (workspace_id, id);

CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_plan_market (
  workspace_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  segment_id UUID NOT NULL,
  intent VARCHAR(16) CHECK (intent IN ('focus', 'validate')),
  approach TEXT,
  market_name VARCHAR(255) NOT NULL,
  criteria JSONB NOT NULL,
  PRIMARY KEY (workspace_id, plan_id, segment_id),
  CONSTRAINT fk_strategy_market_plan FOREIGN KEY (workspace_id, plan_id)
    REFERENCES yucer_gtm.strategy_plan (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_strategy_market_segment FOREIGN KEY (workspace_id, segment_id)
    REFERENCES yucer_gtm.market_segment (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_strategy_market_segment ON yucer_gtm.strategy_plan_market (workspace_id, segment_id);

CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_plan_market_solution (
  workspace_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  segment_id UUID NOT NULL,
  solution_id UUID NOT NULL,
  PRIMARY KEY (workspace_id, plan_id, segment_id, solution_id),
  CONSTRAINT fk_market_solution_target FOREIGN KEY (workspace_id, plan_id, segment_id)
    REFERENCES yucer_gtm.strategy_plan_market (workspace_id, plan_id, segment_id) ON DELETE CASCADE,
  CONSTRAINT fk_market_solution_catalog FOREIGN KEY (workspace_id, solution_id)
    REFERENCES yucer_catalog.solution (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_market_solution_catalog ON yucer_gtm.strategy_plan_market_solution (workspace_id, solution_id);

-- Preserve every valid local legacy selection without inventing a market intent.
INSERT INTO yucer_gtm.strategy_plan_market (workspace_id, plan_id, segment_id, market_name, criteria)
SELECT s.workspace_id, p.id, s.id, s.name, s.criteria
FROM yucer_gtm.market_segment s
JOIN yucer_gtm.strategy_plan p ON p.id = s.plan_id AND p.workspace_id = s.workspace_id
ON CONFLICT DO NOTHING;

-- Each write replaces the selection in the same transaction as the plan.
GRANT SELECT, INSERT, DELETE ON yucer_gtm.strategy_plan_market TO yucer_svc;
GRANT SELECT, INSERT, DELETE ON yucer_gtm.strategy_plan_market_solution TO yucer_svc;
REVOKE UPDATE ON yucer_gtm.strategy_plan_market FROM yucer_svc;
REVOKE UPDATE ON yucer_gtm.strategy_plan_market_solution FROM yucer_svc;
REVOKE UPDATE (plan_id) ON yucer_gtm.market_segment FROM yucer_svc;
