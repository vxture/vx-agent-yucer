-- Exact form proposals, task-scoped grants and atomic execution receipts.
BEGIN;
ALTER TABLE yucer_agent.agent_task_draft ADD CONSTRAINT agent_task_draft_owner_key UNIQUE(id,task_id,workspace_id,actor_sub);
CREATE TABLE IF NOT EXISTS yucer_agent.agent_execution_step (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  draft_id UUID NOT NULL,
  operation VARCHAR(16) NOT NULL CHECK(operation IN ('save','publish')),
  payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
  payload_hash VARCHAR(64) NOT NULL,
  last_error VARCHAR(64),
  attempted_at TIMESTAMPTZ,
  rule_version VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at>created_at),
  CONSTRAINT agent_execution_step_owner_key UNIQUE(id,task_id,workspace_id,actor_sub),
  CONSTRAINT agent_execution_step_unique UNIQUE(task_id,draft_id,operation),
  CONSTRAINT agent_execution_step_draft_fk FOREIGN KEY(draft_id,task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task_draft(id,task_id,workspace_id,actor_sub)
);
CREATE TABLE IF NOT EXISTS yucer_agent.agent_execution_grant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  session_hash VARCHAR(64) NOT NULL,
  step_ids UUID[] NOT NULL CHECK(cardinality(step_ids) BETWEEN 1 AND 20),
  confirmed_ids UUID[] NOT NULL DEFAULT '{}' CHECK(confirmed_ids <@ step_ids),
  mode VARCHAR(24) NOT NULL CHECK(mode IN ('ask_always','ask_high_risk','autonomous')),
  max_actions INTEGER NOT NULL CHECK(max_actions BETWEEN 1 AND 20),
  rule_version VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at>created_at),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT agent_execution_grant_owner_key UNIQUE(id,task_id,workspace_id,actor_sub),
  CONSTRAINT agent_execution_grant_task_fk FOREIGN KEY(task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub)
);
CREATE TABLE IF NOT EXISTS yucer_agent.agent_execution_receipt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  step_id UUID NOT NULL UNIQUE,
  grant_id UUID NOT NULL,
  rule_version VARCHAR(64) NOT NULL,
  result JSONB NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_execution_receipt_step_fk FOREIGN KEY(step_id,task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_execution_step(id,task_id,workspace_id,actor_sub),
  CONSTRAINT agent_execution_receipt_grant_fk FOREIGN KEY(grant_id,task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_execution_grant(id,task_id,workspace_id,actor_sub)
);
CREATE INDEX agent_execution_step_task ON yucer_agent.agent_execution_step(task_id,created_at);
CREATE INDEX agent_execution_grant_task ON yucer_agent.agent_execution_grant(task_id,created_at);
GRANT SELECT, INSERT ON yucer_agent.agent_execution_step TO yucer_svc;
GRANT SELECT, INSERT ON yucer_agent.agent_execution_grant TO yucer_svc;
GRANT SELECT, INSERT ON yucer_agent.agent_execution_receipt TO yucer_svc;
GRANT UPDATE(last_error,attempted_at) ON yucer_agent.agent_execution_step TO yucer_svc;
GRANT UPDATE(revoked_at) ON yucer_agent.agent_execution_grant TO yucer_svc;
CREATE OR REPLACE FUNCTION yucer_agent.guard_execution_revocation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'grant_revocation_is_terminal';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_execution_revocation BEFORE UPDATE ON yucer_agent.agent_execution_grant
FOR EACH ROW EXECUTE FUNCTION yucer_agent.guard_execution_revocation();
COMMIT;
