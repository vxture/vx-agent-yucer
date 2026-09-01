-- 0020_agent_autonomy.sql - how much the copilot may do without being asked.
--
-- Authority: the owner's rulings of 2026-09-01 - "采纳当然要真实发生业务动作"
-- (accepting a proposal must actually do the thing), and the three-mode
-- authorisation that decides when a person is asked at all.
--
-- WHY A TABLE AND NOT A CONFIG VALUE. `autopilotAuthorized` has required three
-- independent yeses since batch 1 - tier, permission, and a workspace opt-in -
-- and the opt-in has never had anywhere to live. It was a parameter nothing
-- supplied, on a verb nothing called. This is the storage that yes needs.
--
-- ONE ROW PER WORKSPACE, keyed by workspace_id. The ruling calls it "owner
-- 用户对 agent 的授权": it is the workspace's posture toward its copilot, not a
-- personal preference. Two members of one workspace watching the same agent
-- take different liberties would make "what did it do without asking" a
-- question with several answers.
--
-- THREE MODES, and the middle one is the default:
--
--   ask_high_risk  the copilot acts on what is safe and asks about the rest.
--   ask_always     every proposal waits for a person. Today's behaviour.
--   autonomous     it acts, and the record says nobody signed.
--
-- DEFAULT ask_always, NOT the middle one, and this is deliberate against the
-- ruling that ask_high_risk is the common case. A workspace that has never
-- opened this setting has not authorised anything, and a migration that
-- silently began letting the agent write would be an authorisation nobody
-- gave. The setting is how it becomes the common case, not the default.
--
-- WHO MAY WRITE IT is `copilot.autopilot`, which the catalogue already reserves
-- and which sales_leader alone holds. Deciding one proposal and deciding that
-- proposals no longer need deciding are different acts.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_agent.agent_autonomy (
  workspace_id  UUID PRIMARY KEY,                     -- [ref]
  mode          VARCHAR(32) NOT NULL DEFAULT 'ask_always'
                  CONSTRAINT chk_agent_autonomy_mode
                  CHECK (mode IN ('ask_high_risk', 'ask_always', 'autonomous')),
  -- WHO turned it on, kept because "the agent did this without asking" has to
  -- be answerable with a name. Not an audit table: the current answer is the
  -- one that matters, and a history of postures nobody reads is a table nobody
  -- maintains.
  decided_by_sub VARCHAR(128),                        -- [ref]
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A table created in an increment has NO privileges for the service role:
-- 97_service_role.sql grants ON ALL TABLES and Postgres evaluates that at grant
-- time, so a table created afterwards is invisible to it. Nothing works - not
-- SELECT, not INSERT - and it fails at runtime against a database that applied
-- cleanly. Hence the grants live here (CLAUDE.md, rigid zone; enforced by
-- check-incr-grants.mjs).
GRANT SELECT, INSERT, DELETE ON yucer_agent.agent_autonomy TO yucer_svc;

-- `workspace_id` is the row's identity and carries no UPDATE grant: a different
-- workspace is a different row, never an edit.
GRANT UPDATE (mode, decided_by_sub, updated_at)
  ON yucer_agent.agent_autonomy TO yucer_svc;
