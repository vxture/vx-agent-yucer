-- 0100_product_type_two_levels.sql - product types in two levels.
--
-- Authority: the owner's ruling of 2026-09-29 on 系统配置 / 产品配置 / 产品类型:
-- the vocabulary becomes two-level (一级类 / 二级类), single-level still valid.
--
-- THREE IDENTIFIERS, EACH WITH ONE JOB (owner: 代码是当前英文-可修改, 编号是
-- XX-XX, 唯一的是 UUID 不显示):
--   * id       - the identity. Products reference it (fk_product_type, 0029);
--                never shown.
--   * type_code - the English code (software, ...). NOW EDITABLE: 0028 locked
--                it because products pointed at it by value; since 0029 they
--                point by id, so renaming a code breaks nothing. Still unique
--                per workspace - imports match on it.
--   * type_no  - NEW. Two digits, the number people read: 01 for a 一级类,
--                01-02 for a 二级类 (its parent's number, then its own).
--                Unique among siblings.
--
-- parent_id is NULL for a 一级类. At most two levels: a 二级类's parent must be
-- a 一级类, and a type that has children cannot itself become a child. A
-- product may carry either level (owner: 一级、二级都可以).
--
-- Existing rows all become 一级类, numbered 01, 02, ... in their current order.
--
-- Idempotent throughout.

ALTER TABLE yucer_catalog.product_type
  ADD COLUMN IF NOT EXISTS parent_id UUID,
  ADD COLUMN IF NOT EXISTS type_no VARCHAR(2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_product_type_parent') THEN
    ALTER TABLE yucer_catalog.product_type
      ADD CONSTRAINT fk_product_type_parent FOREIGN KEY (parent_id)
      REFERENCES yucer_catalog.product_type (id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_type_not_self') THEN
    ALTER TABLE yucer_catalog.product_type
      ADD CONSTRAINT chk_product_type_not_self CHECK (parent_id IS DISTINCT FROM id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_type_no') THEN
    ALTER TABLE yucer_catalog.product_type
      ADD CONSTRAINT chk_product_type_no CHECK (type_no IS NULL OR type_no ~ '^[0-9]{2}$');
  END IF;
END $$;

-- Backfill: every existing type is a 一级类, numbered in its current order.
-- Guarded on "not yet numbered" so a re-run cannot renumber what people set.
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY sort_order, type_code) AS rn
    FROM yucer_catalog.product_type
   WHERE parent_id IS NULL
)
UPDATE yucer_catalog.product_type t
   SET type_no = LPAD(o.rn::text, 2, '0')
  FROM ordered o
 WHERE t.id = o.id AND t.type_no IS NULL AND o.rn <= 99;

-- Required from here on - only once every row carries one (a workspace with
-- more than 99 types would be left for a person to number, not guessed at).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yucer_catalog.product_type WHERE type_no IS NULL) THEN
    ALTER TABLE yucer_catalog.product_type ALTER COLUMN type_no SET NOT NULL;
  END IF;
END $$;

-- A number is unique among its siblings: 01 once among 一级类, and 01 once
-- under each 一级类. NULLS NOT DISTINCT so the 一级类 (parent NULL) compare.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_product_type_no
  ON yucer_catalog.product_type (workspace_id, parent_id, type_no) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_product_type_parent
  ON yucer_catalog.product_type (parent_id);

-- Two levels, no more: a parent must itself be a 一级类, and a type with
-- children cannot be moved under another. A row-crossing rule, so a trigger.
CREATE OR REPLACE FUNCTION yucer_catalog.product_type_two_levels() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM yucer_catalog.product_type
                WHERE id = NEW.parent_id AND parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'product_type: a parent must be a top-level type (two levels at most)'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_product_type_depth';
    END IF;
    IF EXISTS (SELECT 1 FROM yucer_catalog.product_type WHERE parent_id = NEW.id) THEN
      RAISE EXCEPTION 'product_type: a type with children cannot become a child'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_product_type_depth';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_product_type_two_levels ON yucer_catalog.product_type;
CREATE TRIGGER trg_product_type_two_levels
  BEFORE INSERT OR UPDATE OF parent_id ON yucer_catalog.product_type
  FOR EACH ROW EXECUTE FUNCTION yucer_catalog.product_type_two_levels();

-- --- grants -----------------------------------------------------------------
-- Restated in full because grants accumulate. type_code joins the writable
-- set (see above); type_no and parent_id are new and editable - renumbering
-- or moving a 二级类 to another 一级类 is ordinary configuration.
REVOKE UPDATE ON yucer_catalog.product_type FROM yucer_svc;
GRANT UPDATE (type_code, type_no, parent_id, name, sort_order, status, updated_at)
  ON yucer_catalog.product_type TO yucer_svc;
