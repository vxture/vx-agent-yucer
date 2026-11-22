-- Shared business knowledge is independent of personal conversations/memories.
BEGIN;
CREATE TABLE IF NOT EXISTS yucer_agent.agent_business_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  request_id UUID NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  title VARCHAR(100) NOT NULL CHECK(length(trim(title))>0),
  text VARCHAR(4000) NOT NULL CHECK(length(trim(text))>0),
  kind VARCHAR(16) NOT NULL CHECK(kind IN ('fact','decision','inference','hypothesis')),
  state VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(state IN ('active','stopped')),
  audience VARCHAR(16) NOT NULL CHECK(audience IN ('workspace','members')),
  member_subs VARCHAR(128)[] NOT NULL DEFAULT '{}',
  sources JSONB NOT NULL CHECK(jsonb_typeof(sources)='array'),
  reviewed_digest VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_business_knowledge_request UNIQUE(workspace_id,actor_sub,request_id),
  CONSTRAINT agent_business_knowledge_scope UNIQUE(id,workspace_id),
  CONSTRAINT agent_business_knowledge_audience CHECK(
    (audience='workspace' AND cardinality(member_subs)=0) OR
    (audience='members' AND cardinality(member_subs) BETWEEN 1 AND 100))
);
CREATE INDEX agent_business_knowledge_recent ON yucer_agent.agent_business_knowledge(workspace_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS yucer_agent.agent_business_knowledge_revision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  knowledge_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  title VARCHAR(100) NOT NULL,
  text VARCHAR(4000) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  state VARCHAR(16) NOT NULL,
  audience VARCHAR(16) NOT NULL,
  member_subs VARCHAR(128)[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_business_knowledge_revision_key UNIQUE(knowledge_id,workspace_id,revision),
  CONSTRAINT agent_business_knowledge_revision_scope FOREIGN KEY(knowledge_id,workspace_id)
    REFERENCES yucer_agent.agent_business_knowledge(id,workspace_id)
);
CREATE TABLE IF NOT EXISTS yucer_agent.agent_task_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  task_id UUID NOT NULL,
  knowledge_id UUID NOT NULL,
  knowledge_revision INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_task_knowledge_once UNIQUE(task_id,knowledge_id),
  CONSTRAINT agent_task_knowledge_task FOREIGN KEY(task_id,workspace_id,actor_sub)
    REFERENCES yucer_agent.agent_task(id,workspace_id,actor_sub),
  CONSTRAINT agent_task_knowledge_source FOREIGN KEY(knowledge_id,workspace_id,knowledge_revision)
    REFERENCES yucer_agent.agent_business_knowledge_revision(knowledge_id,workspace_id,revision)
);
CREATE TRIGGER guard_knowledge_revision BEFORE UPDATE ON yucer_agent.agent_business_knowledge
  FOR EACH ROW EXECUTE FUNCTION yucer_agent.guard_memory_revision();
ALTER TABLE yucer_agent.agent_private_memory ADD COLUMN knowledge_sources JSONB NOT NULL DEFAULT '[]'
  CHECK(jsonb_typeof(knowledge_sources)='array');
GRANT SELECT,INSERT ON yucer_agent.agent_business_knowledge TO yucer_svc;
GRANT SELECT,INSERT ON yucer_agent.agent_business_knowledge_revision TO yucer_svc;
GRANT SELECT,INSERT ON yucer_agent.agent_task_knowledge TO yucer_svc;
GRANT UPDATE(title,text,kind,state,audience,member_subs,revision,updated_at)
  ON yucer_agent.agent_business_knowledge TO yucer_svc;
COMMIT;
