-- 0010_catalogue_permissions.sql - the catalogue partition gets its gate (ADR-017).
--
-- Authority for the contents: docs/20-specs/50-role-permission-catalog.md. This
-- file and that document must be changed together.
--
-- WHY: incr/0007 built the catalogue - four tables in `yucer_catalog` plus
-- `opportunity_line` - and ADR-014 was explicit that it was a domain of its own
-- ("建一个域，不是给商机加几个字段"). What never happened is the gate. Until this
-- increment the catalogue had ZERO permissions and ZERO actions, which means:
--
--   * `catalog.*` was not a legal action id (DOMAINS had eight entries),
--   * nothing in the product could express who may edit the price book, and
--   * `price_book_entry.floor_price` - the field the whole table exists for,
--     per its own DDL comment - was reachable by any service-layer write.
--
-- NO FEATURE KEY IS ADDED. The 19 keys are the complete commercial surface
-- (owner, 2026-08-26). The catalogue is chain infrastructure rather than a
-- sellable capability: you cannot sell anything without knowing what you sell,
-- and ADR-014 says the same from the data side - everyone reads it, nobody
-- writes it. Its actions carry `feature: null`, so PERMISSIONS ARE THE ONLY
-- GATE ON IT. That is why there are three of them and not two.
--
-- THE FLOOR IS ITS OWN PERMISSION. `domains/catalog/lib/pricing.ts` already
-- decides "a price below the floor needs a signature". Whoever can move the
-- floor can therefore approve every discount in the product without approving
-- anything. Same shape the catalog already draws one level down: sales_rep
-- holds pipeline.write WITHOUT pipeline.forecast, "owns the deal, not the
-- forecast commitment". Here: may edit the catalogue, may not decide what we
-- will not go below.
--
-- Idempotent: re-applying is a no-op.

-- --- The permissions (catalog grows 20 -> 23) -------------------------------
INSERT INTO local_authz.permission (perm_code, name) VALUES
  ('catalog.read',  'Read the product catalogue, solutions and price books'),
  ('catalog.write', 'Maintain products and solutions'),
  ('catalog.price', 'Set list and FLOOR prices - the floor decides which discounts need a signature')
ON CONFLICT (perm_code) DO NOTHING;

-- --- The grants (68 -> 79) --------------------------------------------------
-- Listed literally, in the same shape 0001 and 0002 use: a permission is granted
-- to a named role, never swept in by a pattern.
--
-- catalog.read goes to everyone including viewer: a person who cannot see what
-- the company sells cannot read a deal either, and the catalogue carries no
-- customer data.
--
-- catalog.price goes to sales_leader and sales_ops ONLY. sales_ops already
-- holds pipeline.forecast for the same reason - it is the role that owns the
-- numbers the organisation commits to. Notably NOT sales_rep: the floor exists
-- to constrain the person closing the deal.
INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('sales_leader',      'catalog.read'),
  ('sales_leader',      'catalog.write'),
  ('sales_leader',      'catalog.price'),
  ('sales_ops',         'catalog.read'),
  ('sales_ops',         'catalog.write'),
  ('sales_ops',         'catalog.price'),
  ('marketing_manager', 'catalog.read'),
  ('sales_rep',         'catalog.read'),
  ('presales',          'catalog.read'),
  ('delivery_manager',  'catalog.read'),
  ('viewer',            'catalog.read')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- --- The column lock incr/0007 left open ------------------------------------
-- 0007 wrote `REVOKE UPDATE ON yucer_catalog.price_book_entry` and then granted
-- nothing back, so the table has been insert-only since it was created - a price
-- could be entered but never corrected. That is not the intended design; the
-- intended design is that prices are editable and the ANCHORS are not.
-- The two price columns and nothing else. `effective_at` is part of the unique
-- key (workspace, product, currency, effective_at) and is therefore an ANCHOR:
-- moving it would silently retarget which price a lookup resolves to. A new
-- price at a new time is a new row.
--
-- This grant first named `status` and `updated_at`, which THIS TABLE DOES NOT
-- HAVE - 0007 gave it id / workspace_id / product_id / currency / list_price /
-- floor_price / effective_at and no more. db-init would have died on
-- `column "status" ... does not exist`. Caught by reading the DDL back rather
-- than by any test here: the in-memory adapter cannot model a grant, which is
-- the same reason the db-contract job exists.
REVOKE UPDATE ON yucer_catalog.price_book_entry FROM yucer_svc;
GRANT UPDATE (list_price, floor_price)
  ON yucer_catalog.price_book_entry TO yucer_svc;
