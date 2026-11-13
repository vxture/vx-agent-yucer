-- D1 owns the selection; D9 owns the solution. Both references are workspace-bound.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_strategy_plan_ws_id ON yucer_gtm.strategy_plan (workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_solution_ws_id ON yucer_catalog.solution (workspace_id, id);

CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_plan_solution (
  workspace_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  solution_id UUID NOT NULL,
  PRIMARY KEY (workspace_id, plan_id, solution_id),
  CONSTRAINT fk_strategy_solution_plan FOREIGN KEY (workspace_id, plan_id)
    REFERENCES yucer_gtm.strategy_plan (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_strategy_solution_catalog FOREIGN KEY (workspace_id, solution_id)
    REFERENCES yucer_catalog.solution (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_strategy_solution_catalog ON yucer_gtm.strategy_plan_solution (workspace_id, solution_id);

-- The pair is the identity. A selection changes by inserting/deleting links.
GRANT SELECT, INSERT, DELETE ON yucer_gtm.strategy_plan_solution TO yucer_svc;
REVOKE UPDATE ON yucer_gtm.strategy_plan_solution FROM yucer_svc;
