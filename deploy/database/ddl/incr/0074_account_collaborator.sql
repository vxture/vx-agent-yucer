-- 0074_account_collaborator.sql - a second (third, ...) person working this
-- account, without replacing the owner.
--
-- Authority: owner, 2026-09-20 - 关联协作人 (mockup: "内部同事可以有多个协作
-- 人，但主负责人始终只有一个- 这里关联的都是协作人, 不是替换主负责人").
-- account.owner_sub stays exactly what it is - one name, the account's record
-- of who owns it, read everywhere a "负责人" appears today. This is a
-- SEPARATE, additive roster: who else works the relationship alongside that
-- one owner, not a second owner column and not a change to reassignAccount.
--
-- A PAIR, LIKE territory_unit (incr/0052) and member_territory before it:
-- insert and delete, no UPDATE at all - being on the team or not is a single
-- fact with no third state, and a person added then removed then re-added is
-- three facts, not one row edited twice. Composite primary key, no surrogate
-- id, same shape.
--
-- member_sub, not a foreign key into any local table: authz's own workspace
-- membership is external to this schema (local_authz.member, a different
-- schema), the same reason account.owner_sub itself is a bare VARCHAR and not
-- an FK - see incr/0001's own note on why member identity is referenced by
-- value, not by constraint, across schema boundaries in this product.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_core.account_collaborator (
  workspace_id UUID NOT NULL,
  account_id   UUID NOT NULL,
  member_sub   VARCHAR(128) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_account_collaborator PRIMARY KEY (workspace_id, account_id, member_sub),
  CONSTRAINT fk_account_collaborator_account FOREIGN KEY (account_id)
    REFERENCES yucer_core.account (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_collaborator_account
  ON yucer_core.account_collaborator (workspace_id, account_id);

-- A link is a pair: insert and delete, no UPDATE at all (territory_unit's own
-- shape, incr/0052).
GRANT SELECT, INSERT, DELETE ON yucer_core.account_collaborator TO yucer_svc;

-- --- the permission (catalog grows 26 -> 27) ---------------------------------
--
-- ITS OWN PERMISSION, not account.write. Searching the member directory to
-- pick a colleague is a read the account-editing permission was never meant
-- to answer - the only existing member-directory read (listWorkspaceMembers,
-- authz/admin.ts) is deliberately admin-only (it backs /admin's paid-seat
-- accounting), and reusing it here would hand every account.write holder an
-- admin capability they were never granted. account.collaborator gates BOTH
-- the search-and-pick read and the add/remove write - one permission, like
-- account.record covers both reading and writing evidence.
INSERT INTO local_authz.permission (perm_code, name) VALUES
  ('account.collaborator', 'Add or remove a second person working this account, alongside its one owner')
ON CONFLICT (perm_code) DO NOTHING;

-- --- the grants (420 -> 442) --------------------------------------------------
--
-- THE SAME 22 ROLES account.record ALREADY HOLDS (incr/0011 plus every role
-- added since that inherited it) - working a relationship as a team is the
-- same population as recording what happened in it. NOT sales_ops/viewer
-- (account.record's own exclusions - operations does not meet customers, a
-- read-only member is read-only) and not the pure-management roles
-- (executive/finance/workspace_admin/deal_desk/ops_head/...) that never held
-- account.record either - this rides that permission's exact footprint
-- rather than re-deriving a new one.
INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('sales_leader',           'account.collaborator'),
  ('marketing_manager',      'account.collaborator'),
  ('sales_rep',              'account.collaborator'),
  ('presales',               'account.collaborator'),
  ('delivery_manager',       'account.collaborator'),
  ('sales_manager',          'account.collaborator'),
  ('regional_director',      'account.collaborator'),
  ('senior_sales_manager',   'account.collaborator'),
  ('regional_general_manager','account.collaborator'),
  ('channel_manager',        'account.collaborator'),
  ('senior_channel_manager', 'account.collaborator'),
  ('senior_delivery_manager','account.collaborator'),
  ('senior_presales',        'account.collaborator'),
  ('key_account_manager',    'account.collaborator'),
  ('sdr',                    'account.collaborator'),
  ('customer_success',       'account.collaborator'),
  ('sales_director',         'account.collaborator'),
  ('branch_general_manager', 'account.collaborator'),
  ('channel_head',           'account.collaborator'),
  ('delivery_head',          'account.collaborator'),
  ('presales_head',          'account.collaborator'),
  ('marketing_head',         'account.collaborator')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
