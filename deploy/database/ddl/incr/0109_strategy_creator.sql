-- Creator is server-supplied once, independent of the editable owner.
ALTER TABLE yucer_gtm.strategy_plan
  ADD COLUMN created_by_sub VARCHAR(128);
-- Existing rows deliberately remain NULL: their creator is not recoverable.
-- No UPDATE grant: 98_column_locks continues to lock the creator column.
