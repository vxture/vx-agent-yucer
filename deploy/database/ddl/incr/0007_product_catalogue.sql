-- 0007_product_catalogue.sql - 产品体系 (ADR-014).
--
-- WHY: the model could not say WHAT WE SELL. The only "product" in the baseline
-- is the platform's own product_code (yucer itself, from C2). Consequently
-- opportunity.amount was a number with no composition, contracts had no subject,
-- delivery had no scope, forecasts stopped at money, and both whitespace
-- analysis and signal-to-product matching were structurally impossible - which
-- are exactly the capabilities ADR-013's strategic accounts and targeted
-- intelligence depend on.
--
-- Its own schema rather than columns on opportunity: a catalogue is a dimension
-- REFERENCED ACROSS domains - deals, contracts, delivery and signal matching all
-- read it and none of them writes it. Under ADR-002 that is the shape of a
-- domain.
--
-- NOTE ON NAMING. This has nothing to do with the platform's commercial
-- catalogue (vx_provision.product_code) and must never be joined to it. One
-- says "who do we sell this SaaS to"; the other says "what does the company
-- using this SaaS sell". The words collide and the meanings are opposite.
--
-- Idempotent throughout.

CREATE SCHEMA IF NOT EXISTS yucer_catalog;

-- ===========================================================================
-- product - one sellable thing.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS yucer_catalog.product (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                         -- [ref] isolation key
  product_code  VARCHAR(64) NOT NULL,                  -- anchor, immutable
  name          VARCHAR(255) NOT NULL,
  category      VARCHAR(64),                           -- product line
  unit          VARCHAR(32) NOT NULL DEFAULT 'set',
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_product_status CHECK (status IN ('active', 'retired')),
  CONSTRAINT uidx_product_code UNIQUE (workspace_id, product_code)
);

-- ===========================================================================
-- solution - a named combination, used as a QUOTING TEMPLATE.
-- ===========================================================================
-- Deliberately not referenced by lines for calculation - see solution_id on
-- opportunity_line and ADR-014 section 4.
CREATE TABLE IF NOT EXISTS yucer_catalog.solution (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                         -- [ref] isolation key
  solution_code VARCHAR(64) NOT NULL,                  -- anchor, immutable
  name          VARCHAR(255) NOT NULL,
  summary       TEXT,
  status        VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_solution_status CHECK (status IN ('active', 'retired')),
  CONSTRAINT uidx_solution_code UNIQUE (workspace_id, solution_code)
);

CREATE TABLE IF NOT EXISTS yucer_catalog.solution_item (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                          -- [ref] isolation key
  solution_id  UUID NOT NULL,
  product_id   UUID NOT NULL,
  quantity     NUMERIC(12, 2) NOT NULL DEFAULT 1,
  CONSTRAINT chk_solution_item_qty CHECK (quantity > 0),
  CONSTRAINT fk_solution_item_solution FOREIGN KEY (solution_id)
    REFERENCES yucer_catalog.solution (id) ON DELETE CASCADE,
  CONSTRAINT fk_solution_item_product FOREIGN KEY (product_id)
    REFERENCES yucer_catalog.product (id) ON DELETE RESTRICT,
  CONSTRAINT uidx_solution_item UNIQUE (solution_id, product_id)
);

-- ===========================================================================
-- price_book_entry - list price and FLOOR.
-- ===========================================================================
-- The floor is why this table earns its place. Without it a price book is a
-- reference sheet whose presence changes nothing; with it the table carries a
-- real decision - does this discount need a human to approve it.
CREATE TABLE IF NOT EXISTS yucer_catalog.price_book_entry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                          -- [ref] isolation key
  product_id   UUID NOT NULL,
  currency     VARCHAR(8) NOT NULL DEFAULT 'CNY',
  list_price   NUMERIC(18, 2) NOT NULL,
  floor_price  NUMERIC(18, 2) NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_price_nonneg CHECK (list_price >= 0 AND floor_price >= 0),
  -- A floor above list would make every sale need approval, which is the same
  -- as having no floor at all.
  CONSTRAINT chk_price_floor CHECK (floor_price <= list_price),
  CONSTRAINT fk_price_product FOREIGN KEY (product_id)
    REFERENCES yucer_catalog.product (id) ON DELETE CASCADE,
  CONSTRAINT uidx_price_entry UNIQUE (workspace_id, product_id, currency, effective_at)
);

-- ===========================================================================
-- opportunity_line - what is actually in this deal.
-- ===========================================================================
-- WHEN LINES EXIST, THE LINES ARE AUTHORITATIVE and opportunity.amount is their
-- sum. That reconciliation is enforced in the SERVICE, not here: it spans rows
-- (one header, many lines), a CHECK cannot express it, and a trigger would bury
-- a business rule inside the database. See ADR-014 section 2.
CREATE TABLE IF NOT EXISTS yucer_pipeline.opportunity_line (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                       -- [ref] isolation key
  opportunity_id  UUID NOT NULL,
  product_id      UUID NOT NULL,                       -- [ref] yucer_catalog.product
  -- Provenance only: which template these lines were expanded from. Never used
  -- for calculation, or "which products are in this deal" would have two
  -- answers and both whitespace and product-level forecast need exactly one.
  solution_id     UUID,                                -- [ref] yucer_catalog.solution
  quantity        NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(18, 2) NOT NULL,
  amount          NUMERIC(18, 2) NOT NULL,             -- quantity * unit_price
  currency        VARCHAR(8) NOT NULL DEFAULT 'CNY',
  -- Set when unit_price fell below the product's floor. Written by the service
  -- from the price book, never typed in.
  needs_approval  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_line_qty CHECK (quantity > 0),
  CONSTRAINT chk_line_price CHECK (unit_price >= 0 AND amount >= 0),
  CONSTRAINT fk_line_opportunity FOREIGN KEY (opportunity_id)
    REFERENCES yucer_pipeline.opportunity (id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: deleting a product must not silently rewrite the
  -- history of what was sold.
  CONSTRAINT fk_line_product FOREIGN KEY (product_id)
    REFERENCES yucer_catalog.product (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS opportunity_line_by_opp
  ON yucer_pipeline.opportunity_line (workspace_id, opportunity_id);
-- Product-level forecast and whitespace both scan by product.
CREATE INDEX IF NOT EXISTS opportunity_line_by_product
  ON yucer_pipeline.opportunity_line (workspace_id, product_id);

-- ===========================================================================
-- Grants and locks, HERE rather than in 97/98 - see incr/README.md.
-- ===========================================================================
GRANT USAGE ON SCHEMA yucer_catalog TO yucer_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_catalog.product TO yucer_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_catalog.solution TO yucer_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_catalog.solution_item TO yucer_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_catalog.price_book_entry TO yucer_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_pipeline.opportunity_line TO yucer_svc;

-- product_code / solution_code are anchors: renaming what a thing IS breaks
-- every historical line that referenced it.
REVOKE UPDATE ON yucer_catalog.product FROM yucer_svc;
GRANT UPDATE (name, category, unit, status, updated_at)
  ON yucer_catalog.product TO yucer_svc;

REVOKE UPDATE ON yucer_catalog.solution FROM yucer_svc;
GRANT UPDATE (name, summary, status, updated_at)
  ON yucer_catalog.solution TO yucer_svc;

-- A price entry is a point in time. Correcting one means a new effective_at
-- row, not editing what the price used to be.
REVOKE UPDATE ON yucer_catalog.price_book_entry FROM yucer_svc;

REVOKE UPDATE ON yucer_catalog.solution_item FROM yucer_svc;
GRANT UPDATE (quantity) ON yucer_catalog.solution_item TO yucer_svc;

-- opportunity_id and product_id are the line's identity. Changing which deal or
-- which product a line belongs to is a different line.
REVOKE UPDATE ON yucer_pipeline.opportunity_line FROM yucer_svc;
GRANT UPDATE (quantity, unit_price, amount, currency, needs_approval, updated_at)
  ON yucer_pipeline.opportunity_line TO yucer_svc;
