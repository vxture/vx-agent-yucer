-- 0101_product_type_code_per_category.sql - one code per category, not per level.
--
-- Authority: the owner's review of incr/0100, 2026-09-29: 代码需要单独一行，
-- 现在一二级都有代码，不合理. A category carries ONE code - the category the
-- product is filed under. For 软件产品-基础软件 that is the 二级类's code; a
-- 一级类 created together with its first 二级类 needs none of its own.
--
-- So type_code becomes optional. Rows that have one keep it (every existing
-- 一级类 does), and the unique index still holds for every code that exists:
-- Postgres treats NULLs as distinct in a plain UNIQUE, which is exactly the
-- "no code yet" case, as many times as it occurs.
--
-- Idempotent: DROP NOT NULL on a nullable column is a no-op.

ALTER TABLE yucer_catalog.product_type ALTER COLUMN type_code DROP NOT NULL;
