-- 0011_evidence_capture_permission.sql - recording is not editing (ADR-018).
--
-- Authority for the contents: docs/20-specs/50-role-permission-catalog.md. This
-- file and that document must be changed together.
--
-- WHY: ADR-006 built the evidence plane (yucer_field: interaction,
-- interaction_participant, commitment) and prescribed two new FEATURE keys for
-- it - `account.interaction` and `account.commitment`. Neither was ever added.
-- The whole plane has therefore been gated by `account.upsert`, which resolves
-- to feature `account.manage` and permission `account.write`.
--
-- ADR-018 resolves the entitlement half by DECIDING rather than adding: the
-- evidence plane is not separately sold, and rides the free `account.manage`
-- key on purpose. Paywalling capture would make /admin/adoption measure
-- willingness to pay instead of habit formation, and that reading is what
-- ADR-012 uses to decide whether the judgement layer gets built at all.
--
-- This increment fixes the PERMISSION half, which was a real hole. Only three
-- roles hold `account.write`, so:
--
--   * a DELIVERY MANAGER who sat in a customer meeting could not write down
--     that it happened - and delivery managers hold most of the delivery-side
--     commitments, and are usually the first to notice a customer going quiet;
--   * a MARKETING MANAGER running a campaign could not record a conversation
--     that came out of it.
--
-- Both are holes in the very evidence base the kill criterion reads. Recording
-- what happened is not the same act as editing the customer master record, and
-- collapsing the two silenced the people who meet customers most.
--
-- NOT granted to sales_ops or viewer: operations does not meet customers, and a
-- read-only member is read-only by definition.
--
-- Idempotent: re-applying is a no-op.

-- --- The permission (catalog grows 23 -> 24) --------------------------------
INSERT INTO local_authz.permission (perm_code, name) VALUES
  ('account.record', 'Record interactions and commitments - what happened, not who the customer is')
ON CONFLICT (perm_code) DO NOTHING;

-- --- The grants (79 -> 84) --------------------------------------------------
INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('sales_leader',      'account.record'),
  ('marketing_manager', 'account.record'),
  ('sales_rep',         'account.record'),
  ('presales',          'account.record'),
  ('delivery_manager',  'account.record')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
