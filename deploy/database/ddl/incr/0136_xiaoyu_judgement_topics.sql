-- Personal workflow state; business findings continue to come from domain rules.
BEGIN;
CREATE TABLE IF NOT EXISTS yucer_agent.agent_judgement_topic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  judgement_id VARCHAR(256) NOT NULL,
  scope VARCHAR(8) NOT NULL CHECK(scope IN ('mine','all')),
  basis_version VARCHAR(64) NOT NULL,
  access_version VARCHAR(64) NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK(status IN ('open','processing','verified')),
  task_id UUID,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_judgement_topic_once UNIQUE(workspace_id,actor_sub,judgement_id,scope),
  CONSTRAINT agent_judgement_topic_task FOREIGN KEY(task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub)
);
CREATE INDEX agent_judgement_topic_recent ON yucer_agent.agent_judgement_topic(workspace_id,actor_sub,updated_at DESC);
CREATE TRIGGER guard_judgement_topic_revision BEFORE UPDATE ON yucer_agent.agent_judgement_topic
  FOR EACH ROW EXECUTE FUNCTION yucer_agent.guard_memory_revision();
ALTER TABLE yucer_agent.agent_task_reference DROP CONSTRAINT agent_task_reference_object_kind_check;
ALTER TABLE yucer_agent.agent_task_reference ADD CONSTRAINT agent_task_reference_object_kind_check
  CHECK(object_kind IN ('account','opportunity','lead','strategy','segment','product','solution','campaign','project','plan','judgement','sales_target'));
GRANT SELECT,INSERT ON yucer_agent.agent_judgement_topic TO yucer_svc;
GRANT UPDATE(basis_version,access_version,status,task_id,verified_at,revision,updated_at) ON yucer_agent.agent_judgement_topic TO yucer_svc;
COMMIT;
