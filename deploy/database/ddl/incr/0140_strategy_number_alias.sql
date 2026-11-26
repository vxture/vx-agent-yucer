-- Owner-approved lineage renumbering. UUIDs and publication history stay intact.
BEGIN;
LOCK TABLE yucer_gtm.strategy_plan IN ACCESS EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_number_alias (
  workspace_id UUID NOT NULL,
  legacy_no VARCHAR(64) NOT NULL CHECK (btrim(legacy_no) <> ''),
  lineage_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, legacy_no),
  FOREIGN KEY (workspace_id, lineage_id) REFERENCES yucer_gtm.strategy_plan(workspace_id, id) ON DELETE NO ACTION
);
CREATE INDEX idx_strategy_number_alias_lineage ON yucer_gtm.strategy_number_alias(workspace_id, lineage_id);
INSERT INTO yucer_gtm.strategy_number_alias(workspace_id, legacy_no, lineage_id)
  SELECT workspace_id, plan_no, id FROM yucer_gtm.strategy_plan WHERE base_plan_id IS NULL;

-- Disable only the identity trigger for the locked migration transaction.
-- Preserve edit tokens, timestamps, snapshots, events and every UUID reference.
ALTER TABLE yucer_gtm.strategy_plan DISABLE TRIGGER strategy_plan_guard;
DO $$
DECLARE root RECORD; prefix TEXT; next_seq BIGINT; next_no TEXT;
BEGIN
  FOR root IN SELECT workspace_id, id, created_at FROM yucer_gtm.strategy_plan
      WHERE base_plan_id IS NULL ORDER BY workspace_id, created_at, id LOOP
    prefix := 'STR-' || to_char(root.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD') || '-';
    -- Reserve every prior number, including manually assigned STR-like codes.
    SELECT COALESCE(max(substring(code FROM length(prefix)+1)::bigint),0)+1 INTO next_seq FROM (
      SELECT plan_no AS code FROM yucer_gtm.strategy_plan WHERE workspace_id=root.workspace_id
      UNION ALL SELECT legacy_no FROM yucer_gtm.strategy_number_alias WHERE workspace_id=root.workspace_id
    ) numbers WHERE code LIKE prefix || '%' AND substring(code FROM length(prefix)+1) ~ '^[0-9]{1,12}$';
    IF next_seq > 999999999999 THEN RAISE EXCEPTION 'strategy_number_sequence_exhausted'; END IF;
    next_no := prefix || lpad(next_seq::text, greatest(3,length(next_seq::text)), '0');
    UPDATE yucer_gtm.strategy_plan SET plan_no=next_no WHERE workspace_id=root.workspace_id AND lineage_id=root.id;
  END LOOP;
END $$;
ALTER TABLE yucer_gtm.strategy_plan ENABLE TRIGGER strategy_plan_guard;

-- Former codes may resolve only to their original lineage, never a new root.
CREATE FUNCTION yucer_gtm.strategy_number_alias_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, yucer_gtm AS $$
BEGIN
  IF NEW.base_plan_id IS NULL AND EXISTS (
    SELECT 1 FROM yucer_gtm.strategy_number_alias WHERE workspace_id=NEW.workspace_id AND legacy_no=NEW.plan_no
  ) THEN
    RAISE unique_violation USING MESSAGE='strategy_plan_no_reserved', CONSTRAINT='uidx_strategy_plan_ws_no';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER strategy_number_alias_guard BEFORE INSERT ON yucer_gtm.strategy_plan
  FOR EACH ROW EXECUTE FUNCTION yucer_gtm.strategy_number_alias_guard();
GRANT SELECT ON yucer_gtm.strategy_number_alias TO yucer_svc;
REVOKE INSERT ON yucer_gtm.strategy_number_alias FROM yucer_svc;
REVOKE UPDATE ON yucer_gtm.strategy_number_alias FROM yucer_svc;
REVOKE DELETE ON yucer_gtm.strategy_number_alias FROM yucer_svc;
COMMIT;
