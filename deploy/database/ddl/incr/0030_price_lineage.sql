-- 0030_price_lineage.sql - a price knows which price it replaced.
--
-- Authority: the owner's ruling of 2026-09-05 - price changes need a data
-- basis for analysing how a product's price moved over time.
--
-- WHY A COLUMN RATHER THAN ARITHMETIC. The order of `effective_at` already
-- tells you what came before, and the price book's history table derives its
-- "superseded at" from exactly that. What ordering CANNOT say is which
-- decision replaced which: a backdated correction, two entries stamped the
-- same second, or an import that lands three prices at once all read as one
-- chain when they are not. `supersedes_id` records the decision the writer
-- was actually making, so an analysis of price movement reads a chain the
-- product asserted rather than one a sort inferred.
--
-- ON DELETE SET NULL, deliberately. A superseded entry may be deleted when
-- nothing cites it (the price book's own rule), and that must not take its
-- successor with it - nor leave a pointer to a row that is gone. NULL is the
-- honest answer: "the entry this replaced is no longer kept".
--
-- IMMUTABLE ONCE WRITTEN. Which price replaced which is a fact about a moment
-- that has passed - the same species as the attribution keys ADR-003 freezes -
-- so it is absent from the UPDATE grant. A correction is a new entry.
--
-- Idempotent throughout.

ALTER TABLE yucer_catalog.price_book_entry
  ADD COLUMN IF NOT EXISTS supersedes_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_price_supersedes') THEN
    ALTER TABLE yucer_catalog.price_book_entry
      ADD CONSTRAINT fk_price_supersedes FOREIGN KEY (supersedes_id)
      REFERENCES yucer_catalog.price_book_entry (id) ON DELETE SET NULL;
  END IF;
END $$;

-- A row may not supersede itself: a chain of one is not a chain, and the
-- cycle it would create makes every walk of the lineage non-terminating.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_price_not_self') THEN
    ALTER TABLE yucer_catalog.price_book_entry
      ADD CONSTRAINT chk_price_not_self CHECK (supersedes_id IS DISTINCT FROM id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_price_supersedes
  ON yucer_catalog.price_book_entry (supersedes_id);

-- Backfill the chain that already exists, by the only evidence there is: for
-- each product and currency, each entry supersedes the newest entry that took
-- effect before it. Guarded on "nothing linked yet" so a re-run cannot
-- rewrite a chain the product has since asserted.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yucer_catalog.price_book_entry WHERE supersedes_id IS NOT NULL) THEN
    UPDATE yucer_catalog.price_book_entry e
       SET supersedes_id = prev.id
      FROM (
        SELECT id,
               LAG(id) OVER (
                 PARTITION BY workspace_id, product_id, currency ORDER BY effective_at
               ) AS prev_id
          FROM yucer_catalog.price_book_entry
      ) ordered
      JOIN yucer_catalog.price_book_entry prev ON prev.id = ordered.prev_id
     WHERE e.id = ordered.id;
  END IF;
END $$;

-- --- grants -----------------------------------------------------------------
-- The writable set is unchanged: list and floor may be corrected in a row just
-- written (incr/0010), and the lineage may not be edited at all. Restated in
-- full because grants accumulate.
REVOKE UPDATE ON yucer_catalog.price_book_entry FROM yucer_svc;
GRANT UPDATE (list_price, floor_price)
  ON yucer_catalog.price_book_entry TO yucer_svc;
