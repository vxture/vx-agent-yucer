-- 0082_opportunity_line_custom_note.sql - 产品方案 · 定制 (deal batch 2b).
-- Design: YC-067 §09b (numbered 0090 there - the design's 0082-0090 were
-- tentative, "以合并顺序为准"; this is the first to merge), YC-069 §04b.
--
-- WHAT THIS DEAL TAILORED ON THIS LINE: "含 ERP 双向对接接口开发约 6 周".
-- The catalogue already says how a solution is USUALLY tailored
-- (solution_item.note, incr/0031); this column says what THIS deal actually
-- tailored. Same word, different layer - not merged.
--
-- NOT A NEW OBJECT. The effort of a customisation is already a line (the
-- implementation days); its description hangs on that line. A customisation
-- priced on its own is a new line, not a note.
--
-- IT SURVIVES A RE-QUOTE. Lines are replaced wholesale on every save
-- (replaceLines, ADR-014); the service carries a product's note and its
-- solution provenance onto the new row when the draft does not restate them.
--
-- NULLABLE, no backfill: nothing recorded says what any deal tailored.
--
-- Idempotent throughout.

ALTER TABLE yucer_pipeline.opportunity_line
  ADD COLUMN IF NOT EXISTS custom_note VARCHAR(255);

COMMENT ON COLUMN yucer_pipeline.opportunity_line.custom_note IS
  '本单对这一行的定制说明 (deal-specific; the catalogue default is solution_item.note). See incr/0082.';

-- Joins the writable set. Restated in full because grants accumulate and
-- REVOKE resets first (incr/0067's note); the base shape is incr/0007's.
REVOKE UPDATE ON yucer_pipeline.opportunity_line FROM yucer_svc;
GRANT UPDATE (quantity, unit_price, amount, currency, needs_approval, custom_note, updated_at)
  ON yucer_pipeline.opportunity_line TO yucer_svc;
