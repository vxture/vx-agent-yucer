-- 0076_contract.sql - D7 gets the object its charter always named.
--
-- Authority: owner, 2026-09-21 - docs/20-specs/20-capability-domains.md (D7
-- 持有合同), docs/20-specs/30-business-rules.md §9, and the ownership ruling in
-- docs/30-design/design_yucer_130_panorama-ownership.md §5.
--
-- WHAT WAS MISSING. "把合同变成交付和回款" has been D7's job description since
-- ADR-001, and there has never been a contract. Everything downstream of a
-- signature was anchored on `project` instead: incr/0018 put engagement_type
-- there so a subscription could be told from a one-off, and incr/0066 put the
-- renewal window there so a subscription's end date could be watched. Both are
-- the shadow of a contract falling on the delivery record - they work because a
-- project usually has exactly one contract behind it, and they break the moment
-- it does not (one contract covering three projects, or one project renewed
-- while another lapses).
--
-- THREE THINGS THIS UNBLOCKS, all of them already written down as口径 and none
-- of them computable today:
--   1. 续约窗口 anchored on the contract's own term and notice period
--      (§9.1) - today it is derived from project.ends_at plus a per-workspace
--      constant, which is the project's calendar, not the customer's.
--   2. 已购态 - "what is this customer running right now" (§9.2). There is no
--      row anywhere that says what was bought; opportunity_line says what was
--      QUOTED, and a quote that lost still has lines.
--   3. 白地 (§9.3), which is 可售范围 minus 已购态 and therefore cannot exist
--      until 已购态 does.
--
-- NO owner_sub COLUMN, deliberately. §9.4 rules that renewal belongs to the
-- salesperson who already owns the relationship - and that person is already
-- recorded, on the account and on the opportunity. A third 负责人 column here
-- would be a fourth answer to one question (account.owner_sub,
-- account_collaborator, opportunity.owner_sub), and the three would drift with
-- nothing to report it. 派生不落表.
--
-- THREE STATUSES, AND EXPIRY IS NOT ONE OF THEM. `draft` is being recorded,
-- `active` is in force, `terminated` is ended early by somebody's decision. A
-- contract whose term simply ran out is NOT a fourth status: term_end already
-- says so, and a stored `expired` would need a job to flip rows - a row nobody
-- flipped would then be a lie that reads like a fact. Same reason the renewal
-- window is computed rather than stored.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_delivery.contract (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL,                  -- [ref] isolation key
  contract_no              VARCHAR(64) NOT NULL,           -- anchor, immutable
  name                     VARCHAR(255) NOT NULL,
  account_id               UUID NOT NULL,
  -- Which deal produced it. FROZEN, like project.opportunity_id beside it and
  -- for the same reason the attribution keys are frozen: this is the record of
  -- what earned the revenue, and a link that can be moved afterwards is a
  -- credit allocation that can be moved afterwards.
  opportunity_id           UUID,
  total_amount             NUMERIC(18, 2),
  currency                 VARCHAR(8) NOT NULL DEFAULT 'CNY',
  term_start               TIMESTAMPTZ,
  term_end                 TIMESTAMPTZ,
  -- How many days before term_end the other side must be told. THE CUSTOMER'S
  -- OWN NUMBER, which is why it lives here and renewal_policy.window_days does
  -- not replace it: that one is how early WE want to see it on a queue, this
  -- one is a term of the agreement. They answer different questions and a
  -- workspace default cannot stand in for a signed clause.
  notice_days              SMALLINT NOT NULL DEFAULT 0,
  status                   VARCHAR(32) NOT NULL DEFAULT 'draft',
  -- The lineage. Immutable: "this is year three of the same relationship" is a
  -- fact about how the contract came to exist.
  renewed_from_contract_id UUID,
  signed_at                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contract_status CHECK (status IN ('draft', 'active', 'terminated')),
  CONSTRAINT chk_contract_amount CHECK (total_amount IS NULL OR total_amount >= 0),
  CONSTRAINT chk_contract_notice CHECK (notice_days BETWEEN 0 AND 365),
  CONSTRAINT chk_contract_window
    CHECK (term_end IS NULL OR term_start IS NULL OR term_end >= term_start),
  -- A contract cannot renew itself. Cheap, and it closes the one-row cycle that
  -- would make the lineage walk in §9.1 loop forever.
  CONSTRAINT chk_contract_not_self_renewal
    CHECK (renewed_from_contract_id IS NULL OR renewed_from_contract_id <> id),
  CONSTRAINT fk_contract_account FOREIGN KEY (account_id)
    REFERENCES yucer_core.account (id) ON DELETE RESTRICT,
  CONSTRAINT fk_contract_opportunity FOREIGN KEY (opportunity_id)
    REFERENCES yucer_pipeline.opportunity (id) ON DELETE SET NULL,
  -- RESTRICT: deleting a contract must not silently sever the chain that says
  -- how many years this customer has been renewing.
  CONSTRAINT fk_contract_renewed_from FOREIGN KEY (renewed_from_contract_id)
    REFERENCES yucer_delivery.contract (id) ON DELETE RESTRICT,
  CONSTRAINT uidx_contract_ws_no UNIQUE (workspace_id, contract_no),
  -- ONE CONTRACT IS RENEWED ONCE (§9.1). Without this, two contracts may both
  -- claim to renew the same one, the lineage becomes a fan-out instead of a
  -- chain, and "how many years running" stops having an answer.
  --
  -- PLAIN UNIQUE, i.e. NULLS DISTINCT - the Postgres default, and here it is
  -- the behaviour we want rather than the trap incr/0003 had to undo. Every
  -- first-generation contract has NULL here and they must not collide; 0003's
  -- indexes wanted the opposite (a NULL territory IS one scope) and had to be
  -- rebuilt NULLS NOT DISTINCT to say so.
  CONSTRAINT uidx_contract_renewed_from UNIQUE (renewed_from_contract_id)
);

COMMENT ON TABLE yucer_delivery.contract IS
  '合同 - contract METADATA (term, amount, notice period, lineage), never contract TEXT. See docs/20-specs/10-product-definition.md 非目标 and incr/0076.';

CREATE INDEX IF NOT EXISTS idx_contract_ws_account
  ON yucer_delivery.contract (workspace_id, account_id);

-- The renewal queue's own scan: in-force contracts with a term, by end date.
-- Partial, because a draft has no term worth watching and a terminated one is
-- over regardless of what its term_end still says.
CREATE INDEX IF NOT EXISTS idx_contract_renewal_window
  ON yucer_delivery.contract (workspace_id, term_end)
  WHERE status = 'active' AND term_end IS NOT NULL;

CREATE TABLE IF NOT EXISTS yucer_delivery.contract_line (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                              -- [ref] isolation key
  contract_id  UUID NOT NULL,
  product_id   UUID NOT NULL,                              -- [ref] yucer_catalog.product
  quantity     NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price   NUMERIC(18, 2) NOT NULL,
  amount       NUMERIC(18, 2) NOT NULL,                    -- quantity * unit_price
  currency     VARCHAR(8) NOT NULL DEFAULT 'CNY',
  -- NULL means "runs as long as the contract does", which is the ordinary case.
  -- A value here is a line that stops earlier - a module licensed for year one
  -- of a three-year term. §9.2 reads 已购态 as the UNEXPIRED lines of an
  -- in-force contract, and without this column "unexpired" could only ever mean
  -- the whole contract, so a customer who dropped one module would keep showing
  -- as still running it and 白地 would never contain it again.
  term_end     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contract_line_qty CHECK (quantity > 0),
  CONSTRAINT chk_contract_line_price CHECK (unit_price >= 0 AND amount >= 0),
  CONSTRAINT fk_contract_line_contract FOREIGN KEY (contract_id)
    REFERENCES yucer_delivery.contract (id) ON DELETE CASCADE,
  -- RESTRICT, exactly as fk_line_product does for opportunity_line (incr/0007):
  -- deleting a product must not silently rewrite the history of what was sold.
  CONSTRAINT fk_contract_line_product FOREIGN KEY (product_id)
    REFERENCES yucer_catalog.product (id) ON DELETE RESTRICT
);

COMMENT ON TABLE yucer_delivery.contract_line IS
  '合同明细 - what was actually bought. The only source of 已购态, and therefore of 白地. See incr/0076.';

CREATE INDEX IF NOT EXISTS idx_contract_line_contract
  ON yucer_delivery.contract_line (workspace_id, contract_id);

-- 白地 asks per account "which products are NOT here"; product-level questions
-- ("who is running this module") walk the same edge the other way.
CREATE INDEX IF NOT EXISTS idx_contract_line_product
  ON yucer_delivery.contract_line (workspace_id, product_id);

-- --- grants -----------------------------------------------------------------
--
-- 97 ran before this file and granted ON ALL TABLES IN SCHEMA, which Postgres
-- evaluates at grant time - so these two tables have NO privileges at all
-- unless this file gives them, and 98's REVOKE cannot reach a table that did
-- not exist when it ran. Both halves live here, per incr/README.
--
-- FROZEN ON contract: contract_no (the anchor), account_id (a contract with a
-- different customer is a different contract), opportunity_id and
-- renewed_from_contract_id (both are records of how this contract came to
-- exist - see their column comments).
GRANT SELECT, INSERT, DELETE ON yucer_delivery.contract TO yucer_svc;
GRANT UPDATE (name, total_amount, currency, term_start, term_end, notice_days,
              status, signed_at, updated_at)
  ON yucer_delivery.contract TO yucer_svc;

-- FROZEN ON contract_line: contract_id and product_id are the line's identity,
-- the same rule opportunity_line carries - moving a line to another contract or
-- another product is a different line.
GRANT SELECT, INSERT, DELETE ON yucer_delivery.contract_line TO yucer_svc;
GRANT UPDATE (quantity, unit_price, amount, currency, term_end, updated_at)
  ON yucer_delivery.contract_line TO yucer_svc;

-- --- no new permission ------------------------------------------------------
--
-- delivery.read / delivery.write already gate this domain and they are the
-- right grain: recording what was signed is the same authority as recording
-- what is being delivered against it, held by the same people. The catalog
-- stays at 27 permissions. A feature key is not in question either - the
-- nineteen are frozen (owner, 2026-08-26) and 存量 is not separately sellable.
