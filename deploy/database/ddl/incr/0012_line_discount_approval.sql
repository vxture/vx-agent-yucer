-- 0012_line_discount_approval.sql - somebody has to be able to sign.
--
-- Authority for the contents: docs/20-specs/50-role-permission-catalog.md and
-- ADR-019. This file and those documents must be changed together.
--
-- WHY: incr/0007 gave every product a floor price, and batch 6b-3 made the
-- pricing rule set `opportunity_line.needs_approval` whenever a quoted unit
-- price fell below that floor. The board card counts the flagged lines, the
-- headline badge shows the count, and the line editor paints the price amber.
--
-- Nothing could clear it. The floor created a signature requirement that no
-- role in the catalogue was able to satisfy, so "discount pending approval" was
-- a permanent property of a deal rather than a step in a process. A control
-- that can only ever say no is not a control; people route around it.
--
-- WHY A SEPARATE TABLE, and not a column on the line.
--
-- Lines are written by REPLACE, not by patch: editing one line deletes and
-- recreates all of them (see replaceOpportunityLines). An approval stored on
-- the line would therefore be destroyed by any later edit to any OTHER line on
-- the same deal, which makes the signature worthless.
--
-- Keying the approval by (opportunity, product, unit_price, currency) instead
-- gives the behaviour we actually want, for free:
--
--   * re-quoting the same product at the SAME price still matches - the
--     signature survives an unrelated edit;
--   * re-quoting it LOWER matches nothing, so it needs a new signature - which
--     is the point, since nobody signed off the new number;
--   * re-quoting it back UP to a price that was signed off matches again, and
--     correctly so: that price was approved.
--
-- Append-only, like every other decision record in this product (ADR-003): a
-- withdrawn approval is not a deleted row, it is a superseded one. There is no
-- UPDATE grant and no DELETE grant at all.
--
-- Idempotent: re-applying is a no-op.

-- --- The record -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS yucer_pipeline.line_discount_approval (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                       -- [ref] isolation key
  opportunity_id  UUID NOT NULL,
  product_id      UUID NOT NULL,                       -- [ref] yucer_catalog.product
  -- The exact number that was signed off. A line matches this approval only
  -- when its unit_price and currency are both equal; see the note above.
  unit_price      NUMERIC(18, 2) NOT NULL,
  currency        VARCHAR(8) NOT NULL DEFAULT 'CNY',
  -- The floor that was in force when the signature was given, copied in rather
  -- than looked up later. A price book moves; what the approver was actually
  -- overriding must not move with it.
  floor_price     NUMERIC(18, 2) NOT NULL,
  -- A signature without a stated reason is a click. The service refuses blank.
  reason          TEXT NOT NULL,
  approved_by_sub VARCHAR(255) NOT NULL,
  approved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_approval_price CHECK (unit_price >= 0 AND floor_price >= 0),
  CONSTRAINT chk_approval_reason CHECK (length(btrim(reason)) > 0),
  CONSTRAINT fk_approval_opportunity FOREIGN KEY (opportunity_id)
    REFERENCES yucer_pipeline.opportunity (id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: deleting a product must not silently erase the
  -- record of who authorised selling it below floor.
  CONSTRAINT fk_approval_product FOREIGN KEY (product_id)
    REFERENCES yucer_catalog.product (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS line_discount_approval_by_opp
  ON yucer_pipeline.line_discount_approval (workspace_id, opportunity_id);

-- --- Grants (append-only: no UPDATE, no DELETE) ------------------------------

GRANT SELECT, INSERT ON yucer_pipeline.line_discount_approval TO yucer_svc;

-- --- The permission (catalog grows 24 -> 25) --------------------------------
--
-- NOT a new feature key. Feature keys are frozen at 19 and a discount approval
-- is not separately sellable - it is who inside a workspace may do this, which
-- is exactly what a permission is for. The lines it governs are already behind
-- the `pipeline.manage` key through pipeline.opportunity.update.
--
-- SEPARATE from pipeline.opportunity.update on purpose: the person who quotes
-- below the floor must not be the person who signs it off. Collapsing the two
-- would mean every rep who can type a price can also authorise it, and the
-- floor would stop being a constraint on anybody.

INSERT INTO local_authz.permission (perm_code, name) VALUES
  ('pipeline.discount', 'Authorise a quoted price below the product floor')
ON CONFLICT (perm_code) DO NOTHING;

-- --- The grants (84 -> 86) --------------------------------------------------
--
-- The same two roles that hold `catalog.price`, and for one reason: setting the
-- floor and granting an exception to it are two halves of the same authority.
-- sales_ops can already move a floor, so withholding the transaction-level
-- exception from operations would be theatre rather than separation of duties.
--
-- NOT sales_rep: the floor exists to constrain the person closing the deal.
-- NOT presales or delivery_manager: neither owns the commercial terms.

INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('sales_leader', 'pipeline.discount'),
  ('sales_ops',    'pipeline.discount')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
