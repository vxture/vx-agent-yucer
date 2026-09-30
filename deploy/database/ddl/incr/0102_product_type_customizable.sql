-- 0102_product_type_customizable.sql - a product type can say it supports customisation.
--
-- Authority: the owner's ruling of 2026-09-29 on the 产品类型 list: add a
-- 支持定制 marker. A MARKER ONLY for now (owner: 先只是标识) - nothing reads it
-- to allow or refuse anything; quote lines keep their 本单定制说明 regardless.
--
-- It belongs to the CATEGORY, like the code (incr/0101): set on the 二级类
-- when there is one, otherwise on the 一级类.
--
-- Idempotent throughout.

ALTER TABLE yucer_catalog.product_type
  ADD COLUMN IF NOT EXISTS customizable BOOLEAN NOT NULL DEFAULT false;

-- --- grants -----------------------------------------------------------------
-- Restated in full because grants accumulate (incr/0100 set the rest).
REVOKE UPDATE ON yucer_catalog.product_type FROM yucer_svc;
GRANT UPDATE (type_code, type_no, parent_id, name, sort_order, status, customizable, updated_at)
  ON yucer_catalog.product_type TO yucer_svc;
