-- 0022_member_data_scope.sql - which rows a member may see.
--
-- Authority: the owner's rulings of 2026-09-01 - roles first and data scope
-- next; the decision belongs to the workspace ADMINISTRATOR ("不一定是总经理");
-- and scope narrows BOTH lists and reads by id, which makes it confidentiality
-- rather than organisation.
--
-- SCOPE IS A PROPERTY OF THE MEMBER, NOT OF THE ROLE, and that is the whole
-- shape of the ruling. Deriving it from the role - "a regional director sees
-- their region" - would put the decision in the catalogue, which is
-- product-wide and closed. Putting it on the member puts it where the admin
-- can reach it, per workspace, per person.
--
-- WHY IT LIVES IN local_authz. Scope is a second isolation key, the same kind
-- of thing as workspace_id: not a business rule about what a row means, but a
-- statement about who the row is for. workspace_id lives on every table and is
-- carried by every store call; scope is carried the same way. Keeping it beside
-- the member also means the context that already resolves permissions resolves
-- this in the same breath.
--
-- THE DEFAULT IS `workspace`, AND THAT IS DELIBERATELY NOT FAIL-CLOSED - which
-- is the opposite of what incr/0020 did for agent_autonomy, so the difference
-- is worth stating. Autonomy defaulted to the most restrictive value because it
-- was about GRANTING A MACHINE a power nobody had granted. Scope is about
-- TAKING VISIBILITY AWAY from people who have it today: every existing
-- workspace would silently lose rows on the morning this ships, and nobody
-- asked for that restriction. The admin narrows deliberately; a migration must
-- not narrow on their behalf.
--
-- TERRITORY IDS ARE STORED WITHOUT A FOREIGN KEY, like workspace_id and
-- owner_sub before them. local_authz sits UNDER the domains and must not depend
-- on one - a REFERENCES into yucer_gtm would invert the layering at the data
-- level, which is worse than at the import level because a database cannot be
-- refactored back out of it. The service validates the id; the database records
-- it.
--
-- MANY-TO-MANY, because `territory.owner_sub` cannot express this. That column
-- says who OWNS one territory - one person per territory - and a regional
-- director covers several. Reusing it would have made "sees this region" and
-- "is accountable for this region" the same fact, and they are not: an
-- administrator may want a sales ops analyst to see three regions they own
-- none of.
--
-- Idempotent throughout.

-- --- 1. the scope itself ----------------------------------------------------
ALTER TABLE local_authz.member
  ADD COLUMN IF NOT EXISTS scope VARCHAR(32) NOT NULL DEFAULT 'workspace';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_member_scope'
  ) THEN
    ALTER TABLE local_authz.member
      ADD CONSTRAINT chk_member_scope
      CHECK (scope IN ('workspace', 'territory', 'own'));
  END IF;
END $$;

-- --- 2. which territories, for the territory scope --------------------------
--
-- No row here means a `territory`-scoped member sees NOTHING, which is the
-- honest reading: "scoped to territories" with no territories assigned is a
-- half-finished configuration, and showing them the whole workspace instead
-- would make the setting look applied when it is not. The admin surface refuses
-- to save that combination; this table simply does not pretend otherwise.
CREATE TABLE IF NOT EXISTS local_authz.member_territory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL,
  territory_id UUID NOT NULL,                         -- [ref] yucer_gtm.territory
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_member_territory_member FOREIGN KEY (member_id)
    REFERENCES local_authz.member (id) ON DELETE CASCADE,
  CONSTRAINT uidx_member_territory UNIQUE (member_id, territory_id)
);

-- A table created in an increment has NO privileges for the service role:
-- 97_service_role.sql grants ON ALL TABLES and Postgres evaluates that at grant
-- time, so a table created afterwards is invisible to it. Hence the grants live
-- here (CLAUDE.md, rigid zone; enforced by check-incr-grants.mjs).
GRANT SELECT, INSERT, DELETE ON local_authz.member_territory TO yucer_svc;

-- No UPDATE grant at all, and that is the design rather than an omission: an
-- assignment is a pair. Moving a member from one territory to another is a
-- delete and an insert, not an edit - the same reasoning that makes
-- account_relation append-only. There is no third column to change.

-- --- 3. the member's own write surface --------------------------------------
-- 98_column_locks.sql granted UPDATE on (display_name, avatar_hash, status,
-- updated_at). `scope` is new and needs adding, or the administrator's setting
-- fails at runtime against a database that applied cleanly - which is exactly
-- the failure the column-lock discipline exists to make loud.
GRANT UPDATE (scope) ON local_authz.member TO yucer_svc;
