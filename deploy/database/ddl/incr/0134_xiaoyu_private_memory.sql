-- Private memory never has a sharing flag. Team knowledge has separate storage.
BEGIN;
CREATE TABLE IF NOT EXISTS yucer_agent.agent_private_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  request_id UUID NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  text VARCHAR(1200) NOT NULL CHECK(length(trim(text))>0),
  kind VARCHAR(16) NOT NULL CHECK(kind IN ('fact','decision','inference','hypothesis')),
  state VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(state IN ('active','stopped')),
  origin VARCHAR(16) NOT NULL CHECK(origin IN ('user','model')),
  task_id UUID,
  message_ids UUID[] NOT NULL DEFAULT '{}',
  sources JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(sources)='array'),
  parents JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(parents)='array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_private_memory_request UNIQUE(workspace_id,actor_sub,request_id),
  CONSTRAINT agent_private_memory_owner UNIQUE(id,workspace_id,actor_sub),
  CONSTRAINT agent_private_memory_task FOREIGN KEY(task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub)
);
CREATE INDEX agent_private_memory_recent ON yucer_agent.agent_private_memory(workspace_id,actor_sub,updated_at DESC);
CREATE TABLE IF NOT EXISTS yucer_agent.agent_private_memory_revision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  memory_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  text VARCHAR(1200) NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK(kind IN ('fact','decision','inference','hypothesis')),
  state VARCHAR(16) NOT NULL CHECK(state IN ('active','stopped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_private_memory_revision_key UNIQUE(memory_id,workspace_id,actor_sub,revision),
  CONSTRAINT agent_private_memory_revision_owner FOREIGN KEY(memory_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_private_memory(id,workspace_id,actor_sub)
);
CREATE TABLE IF NOT EXISTS yucer_agent.agent_task_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  memory_id UUID NOT NULL,
  memory_revision INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_task_memory_once UNIQUE(task_id,memory_id),
  CONSTRAINT agent_task_memory_task FOREIGN KEY(task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub),
  CONSTRAINT agent_task_memory_source FOREIGN KEY(memory_id,workspace_id,actor_sub,memory_revision)
    REFERENCES yucer_agent.agent_private_memory_revision(memory_id,workspace_id,actor_sub,revision)
);
CREATE FUNCTION yucer_agent.guard_memory_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision <> OLD.revision+1 THEN RAISE EXCEPTION 'memory_revision_required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_memory_revision BEFORE UPDATE ON yucer_agent.agent_private_memory
  FOR EACH ROW EXECUTE FUNCTION yucer_agent.guard_memory_revision();
GRANT SELECT,INSERT ON yucer_agent.agent_private_memory TO yucer_svc;
GRANT SELECT,INSERT ON yucer_agent.agent_private_memory_revision TO yucer_svc;
GRANT SELECT,INSERT ON yucer_agent.agent_task_memory TO yucer_svc;
GRANT UPDATE(text,kind,state,revision,updated_at) ON yucer_agent.agent_private_memory TO yucer_svc;
COMMIT;
