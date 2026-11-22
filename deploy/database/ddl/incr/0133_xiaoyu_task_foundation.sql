-- Private D8 tasks. Composite references cannot cross workspace or owner.
-- Old transcripts remain unchanged; legacy links never grant history replay.
BEGIN;
ALTER TABLE yucer_agent.agent_session ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'legacy'
  CHECK (kind IN ('legacy','task'));
ALTER TABLE yucer_agent.agent_session ADD CONSTRAINT agent_session_owner_key UNIQUE(id,workspace_id,actor_sub,kind);
ALTER TABLE yucer_agent.agent_message ADD CONSTRAINT agent_message_scope_key UNIQUE(id,workspace_id,session_id);

CREATE TABLE IF NOT EXISTS yucer_agent.agent_task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  request_id UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  session_id UUID NOT NULL UNIQUE,
  session_kind VARCHAR(16) NOT NULL DEFAULT 'task' CHECK(session_kind='task'),
  goal VARCHAR(1000) NOT NULL CHECK(length(trim(goal))>0),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
  rule_version VARCHAR(64) NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  page JSONB CHECK(page IS NULL OR jsonb_typeof(page)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_task_request_key UNIQUE(workspace_id,actor_sub,request_id),
  CONSTRAINT agent_task_owner_key UNIQUE(id,workspace_id,actor_sub),
  CONSTRAINT agent_task_session_key UNIQUE(id,workspace_id,actor_sub,session_id),
  CONSTRAINT agent_task_session_fk FOREIGN KEY(session_id,workspace_id,actor_sub,session_kind)
    REFERENCES yucer_agent.agent_session(id,workspace_id,actor_sub,kind)
);
CREATE INDEX agent_task_recent ON yucer_agent.agent_task(workspace_id,actor_sub,updated_at DESC);

-- This is an append-only dependency closure. Navigating away, unlinking a UI
-- target or clearing page context must never remove the source access check.
CREATE TABLE IF NOT EXISTS yucer_agent.agent_task_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  object_kind VARCHAR(32) NOT NULL CHECK(object_kind IN ('account','opportunity','lead','strategy','segment','product','solution','campaign','project','plan')),
  object_id UUID NOT NULL,
  source_version VARCHAR(128) NOT NULL,
  role VARCHAR(16) NOT NULL CHECK(role IN ('target','context','legacy')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_task_reference_unique UNIQUE(task_id,object_kind,object_id,role),
  CONSTRAINT agent_task_reference_owner_fk FOREIGN KEY(task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub)
);
CREATE INDEX agent_task_reference_source ON yucer_agent.agent_task_reference(workspace_id,object_kind,object_id);

CREATE TABLE IF NOT EXISTS yucer_agent.agent_task_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  session_id UUID NOT NULL,
  session_kind VARCHAR(16) NOT NULL DEFAULT 'legacy' CHECK(session_kind='legacy'),
  history_policy VARCHAR(16) NOT NULL DEFAULT 'excluded' CHECK(history_policy='excluded'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_task_legacy_unique UNIQUE(task_id,session_id),
  CONSTRAINT agent_task_legacy_owner_fk FOREIGN KEY(task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub),
  CONSTRAINT agent_task_legacy_session_fk FOREIGN KEY(session_id,workspace_id,actor_sub,session_kind)
    REFERENCES yucer_agent.agent_session(id,workspace_id,actor_sub,kind)
);

-- Revision snapshots are immutable. Only private notes are enabled in 01A;
-- business form keys/validation adapters arrive in 04A, without a write bypass.
CREATE TABLE IF NOT EXISTS yucer_agent.agent_task_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  draft_key VARCHAR(64) NOT NULL,
  contract_version VARCHAR(64) NOT NULL CHECK(contract_version='private-notes/1'),
  revision INTEGER NOT NULL CHECK(revision>0),
  content JSONB NOT NULL CHECK(jsonb_typeof(content)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_task_draft_revision UNIQUE(task_id,draft_key,revision),
  CONSTRAINT agent_task_draft_owner_fk FOREIGN KEY(task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub)
);

CREATE TABLE IF NOT EXISTS yucer_agent.agent_task_checkpoint (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  rule_version VARCHAR(64) NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision>0),
  last_seq BIGINT NOT NULL CHECK(last_seq>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_task_checkpoint_revision UNIQUE(task_id,task_revision),
  CONSTRAINT agent_task_checkpoint_owner_fk FOREIGN KEY(task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub)
);

CREATE TABLE IF NOT EXISTS yucer_agent.agent_task_turn (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  session_id UUID NOT NULL,
  request_id UUID NOT NULL,
  question_hash VARCHAR(64) NOT NULL,
  rule_version VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'running' CHECK(status IN ('running','succeeded','failed','interrupted')),
  user_message_id UUID NOT NULL,
  assistant_message_id UUID,
  error_key VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT agent_task_turn_request UNIQUE(task_id,request_id),
  CONSTRAINT agent_task_turn_finished CHECK(
    (status='running' AND finished_at IS NULL AND assistant_message_id IS NULL AND error_key IS NULL) OR
    (status='succeeded' AND finished_at IS NOT NULL AND assistant_message_id IS NOT NULL AND error_key IS NULL) OR
    (status IN ('failed','interrupted') AND finished_at IS NOT NULL AND assistant_message_id IS NULL AND error_key IS NOT NULL)),
  CONSTRAINT agent_task_turn_owner_fk FOREIGN KEY(task_id,workspace_id,actor_sub,session_id)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub,session_id),
  CONSTRAINT agent_task_turn_question_fk FOREIGN KEY(user_message_id,workspace_id,session_id)
    REFERENCES yucer_agent.agent_message(id,workspace_id,session_id),
  CONSTRAINT agent_task_turn_answer_fk FOREIGN KEY(assistant_message_id,workspace_id,session_id)
    REFERENCES yucer_agent.agent_message(id,workspace_id,session_id)
);
CREATE OR REPLACE FUNCTION yucer_agent.guard_task_turn_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'running' OR NEW.status = 'running' THEN
    RAISE EXCEPTION 'task_turn_finished';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_task_turn_completion BEFORE UPDATE ON yucer_agent.agent_task_turn
  FOR EACH ROW EXECUTE FUNCTION yucer_agent.guard_task_turn_completion();
CREATE UNIQUE INDEX agent_task_one_running_turn ON yucer_agent.agent_task_turn(task_id) WHERE status='running';

GRANT SELECT, INSERT ON yucer_agent.agent_task TO yucer_svc;
GRANT SELECT, INSERT ON yucer_agent.agent_task_reference TO yucer_svc;
GRANT SELECT, INSERT ON yucer_agent.agent_task_session TO yucer_svc;
GRANT SELECT, INSERT ON yucer_agent.agent_task_draft TO yucer_svc;
GRANT SELECT, INSERT ON yucer_agent.agent_task_checkpoint TO yucer_svc;
GRANT SELECT, INSERT ON yucer_agent.agent_task_turn TO yucer_svc;
GRANT UPDATE(status,rule_version,revision,page,updated_at) ON yucer_agent.agent_task TO yucer_svc;
GRANT UPDATE(status,assistant_message_id,error_key,finished_at) ON yucer_agent.agent_task_turn TO yucer_svc;
COMMIT;
