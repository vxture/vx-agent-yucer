-- 0031_solution_customisation.sql - a solution is a combination AND a fit.
--
-- Authority: the owner's ruling of 2026-09-05 - 解决方案 = 产品组合 + 业务定制.
-- The combination has been here since incr/0007 (solution_item: which
-- products, how many). The CUSTOMISATION half never existed, so a solution
-- was a bundle with a name and nothing that said who it was shaped for or
-- what gets tailored per deal.
--
-- Three columns carry that half, and each answers a question a quote actually
-- asks:
--
--   solution.scenario      - the situation this solution is FOR. Free text on
--                            purpose: it is a sentence a salesperson says to a
--                            customer, not a key anything groups by. A
--                            vocabulary here would be inventing a taxonomy
--                            nobody asked for (the 类型/状态 lesson).
--   solution_item.optional - standard or add-on. THIS is the customisation
--                            inside the combination: a solution where every
--                            line is mandatory is a package, and one where
--                            none is, is a menu. The rule layer refuses the
--                            second.
--   solution_item.note     - what is tailored about this line: "按门店数量",
--                            "含二次开发 10 人日". Per item, because that is
--                            where the tailoring is decided.
--
-- solution.sort_order joins them for the same reason product.sort_order
-- exists (incr/0028): the order a catalogue is presented in is somebody's
-- decision, and no derivable order knows it.
--
-- Idempotent throughout.

ALTER TABLE yucer_catalog.solution
  ADD COLUMN IF NOT EXISTS scenario VARCHAR(255);

ALTER TABLE yucer_catalog.solution
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Dense from 1 by code, guarded on "everything still zero" so a re-run cannot
-- shuffle an order somebody has arranged (incr/0028's guard, verbatim).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yucer_catalog.solution WHERE sort_order <> 0) THEN
    UPDATE yucer_catalog.solution s
       SET sort_order = ranked.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY solution_code) AS rn
          FROM yucer_catalog.solution
      ) ranked
     WHERE ranked.id = s.id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_solution_ws_sort
  ON yucer_catalog.solution (workspace_id, sort_order);

ALTER TABLE yucer_catalog.solution_item
  ADD COLUMN IF NOT EXISTS optional BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE yucer_catalog.solution_item
  ADD COLUMN IF NOT EXISTS note VARCHAR(255);

-- --- grants -----------------------------------------------------------------
-- Both tables keep their anchors locked and gain the new columns as writable:
-- a solution's fit and its tailoring are edited, which is the whole point of
-- them. Restated in full because grants accumulate (0007 granted the first
-- set; the REVOKE resets before the wider grant lands).
REVOKE UPDATE ON yucer_catalog.solution FROM yucer_svc;
GRANT UPDATE (name, summary, status, scenario, sort_order, updated_at)
  ON yucer_catalog.solution TO yucer_svc;

REVOKE UPDATE ON yucer_catalog.solution_item FROM yucer_svc;
GRANT UPDATE (quantity, optional, note) ON yucer_catalog.solution_item TO yucer_svc;
