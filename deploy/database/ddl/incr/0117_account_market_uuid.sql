-- Customer assignments use the market UUID. The old code is kept for the
-- previous application version during a rolling deploy and for unmatched data.
BEGIN;
ALTER TABLE yucer_core.account ADD COLUMN segment_id UUID;
UPDATE yucer_core.account a SET segment_id = m.id
FROM yucer_gtm.market_segment m
WHERE a.workspace_id = m.workspace_id AND a.segment_code = m.segment_code;
ALTER TABLE yucer_core.account ADD CONSTRAINT fk_account_market_segment
  FOREIGN KEY (workspace_id, segment_id)
  REFERENCES yucer_gtm.market_segment (workspace_id, id) ON DELETE RESTRICT;
CREATE INDEX idx_account_ws_segment ON yucer_core.account (workspace_id, segment_id);
GRANT UPDATE (segment_id) ON yucer_core.account TO yucer_svc;

CREATE FUNCTION yucer_core.sync_account_market_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.segment_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.segment_id IS DISTINCT FROM OLD.segment_id) THEN
    NEW.segment_code := (SELECT m.segment_code FROM yucer_gtm.market_segment m
      WHERE m.workspace_id = NEW.workspace_id AND m.id = NEW.segment_id);
  ELSIF TG_OP = 'INSERT' OR NEW.segment_code IS DISTINCT FROM OLD.segment_code THEN
    NEW.segment_id := (SELECT m.id FROM yucer_gtm.market_segment m
      WHERE m.workspace_id = NEW.workspace_id AND m.segment_code = NEW.segment_code);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION yucer_core.sync_account_market_reference() FROM PUBLIC;
CREATE TRIGGER sync_account_market_reference BEFORE INSERT OR UPDATE OF segment_id, segment_code
  ON yucer_core.account FOR EACH ROW EXECUTE FUNCTION yucer_core.sync_account_market_reference();
COMMIT;
