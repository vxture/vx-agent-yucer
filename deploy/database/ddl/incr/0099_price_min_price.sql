-- 0099_price_min_price.sql - a price carries a hard minimum (保底价).
--
-- Authority: the owner's ruling of 2026-09-29 on the price book - three
-- prices per product, not two: 标准价 (list_price), 审批价 (floor_price) and
-- 保底价 (min_price).
--
-- WHAT EACH ONE DOES.
--   * list_price  - what is quoted to the customer.
--   * floor_price - unchanged in meaning, renamed in the interface only: a
--                   line below it needs a signature (ADR-019). The column
--                   keeps its name; every signature already written copies
--                   it, and renaming a column that approvals cite is churn
--                   with no reader.
--   * min_price   - NEW. A line below it is REFUSED - no signature can make
--                   it legal (owner: 拒绝保存).
--
-- NULLABLE, deliberately. Every entry written before today has no minimum,
-- and inventing one would be a commercial decision nobody made. NULL means
-- "no hard minimum was set for this price", and the line rule reads it that
-- way. From today on the service REQUIRES it on every new price (owner:
-- 新设价必填), so NULL only ever describes history.
--
-- ORDERED: min <= floor <= list. A minimum above the approval line would make
-- the signature unreachable - every price the approver could sign would be
-- refused anyway.
--
-- WRITABLE like the other two amounts (incr/0010): a typo in a row just
-- written may be corrected in place; the lineage stays frozen (incr/0030).
--
-- Idempotent throughout.

ALTER TABLE yucer_catalog.price_book_entry
  ADD COLUMN IF NOT EXISTS min_price NUMERIC(18, 2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_price_min') THEN
    ALTER TABLE yucer_catalog.price_book_entry
      ADD CONSTRAINT chk_price_min
      CHECK (min_price IS NULL OR (min_price >= 0 AND min_price <= floor_price));
  END IF;
END $$;

-- --- grants -----------------------------------------------------------------
-- Restated in full because grants accumulate: list, floor and now min may be
-- corrected in a row just written; the lineage may not be edited at all.
REVOKE UPDATE ON yucer_catalog.price_book_entry FROM yucer_svc;
GRANT UPDATE (list_price, floor_price, min_price)
  ON yucer_catalog.price_book_entry TO yucer_svc;
