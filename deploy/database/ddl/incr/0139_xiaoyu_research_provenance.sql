-- Private turn provenance is completed atomically with the answer and then frozen.
BEGIN;
ALTER TABLE yucer_agent.agent_task_turn ADD COLUMN artifacts JSONB NOT NULL DEFAULT '{}'
  CHECK(jsonb_typeof(artifacts)='object' AND octet_length(artifacts::text)<=131072);
GRANT UPDATE(artifacts) ON yucer_agent.agent_task_turn TO yucer_svc;
COMMIT;
