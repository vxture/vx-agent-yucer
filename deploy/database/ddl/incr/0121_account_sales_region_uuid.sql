-- Store the configured sales region as a workspace-scoped UUID. Keep the old
-- name for rollout and unresolved historical classifications.
BEGIN;
ALTER TABLE yucer_core.market_division ADD CONSTRAINT uidx_market_division_ws_id UNIQUE (workspace_id, id);
ALTER TABLE yucer_core.account ADD COLUMN region_id UUID;

CREATE FUNCTION yucer_core.account_region_id_for_name(ws UUID, region_name TEXT)
RETURNS UUID LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(d.id))[1] END
  FROM yucer_core.market_division d
  LEFT JOIN yucer_core.market_scope s ON s.workspace_id = d.workspace_id
  WHERE d.workspace_id = ws AND d.name = region_name
    AND d.scope = COALESCE(s.scope_kind, 'china')
    AND d.scope_province = COALESCE(s.scope_province, '')
$$;
REVOKE ALL ON FUNCTION yucer_core.account_region_id_for_name(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_core.account_region_id_for_name(UUID, TEXT) TO yucer_svc;

UPDATE yucer_core.account SET region_id = yucer_core.account_region_id_for_name(workspace_id, region)
WHERE region IS NOT NULL;
ALTER TABLE yucer_core.account ADD CONSTRAINT fk_account_sales_region
  FOREIGN KEY (workspace_id, region_id)
  REFERENCES yucer_core.market_division (workspace_id, id) ON DELETE SET NULL (region_id);
CREATE INDEX idx_account_ws_region_id ON yucer_core.account (workspace_id, region_id);
GRANT UPDATE (region_id) ON yucer_core.account TO yucer_svc;

CREATE FUNCTION yucer_core.sync_account_region_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.region_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.region_id IS DISTINCT FROM OLD.region_id) THEN
    NEW.region := (SELECT d.name FROM yucer_core.market_division d
      WHERE d.workspace_id = NEW.workspace_id AND d.id = NEW.region_id);
  ELSIF TG_OP = 'INSERT' OR NEW.region IS DISTINCT FROM OLD.region THEN
    NEW.region_id := yucer_core.account_region_id_for_name(NEW.workspace_id, NEW.region);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION yucer_core.sync_account_region_reference() FROM PUBLIC;
CREATE TRIGGER sync_account_region_reference BEFORE INSERT OR UPDATE OF region_id, region
  ON yucer_core.account FOR EACH ROW EXECUTE FUNCTION yucer_core.sync_account_region_reference();
COMMIT;
