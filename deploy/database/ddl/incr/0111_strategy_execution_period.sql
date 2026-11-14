-- One persisted calendar key is authoritative: YYYY, YYYY-Qn, or an ISO
-- inclusive date interval. Legacy half-year keys remain readable/valid.
-- Existing free-text labels are not rewritten or assigned invented dates.
BEGIN;
CREATE FUNCTION yucer_gtm.strategy_period_valid(value TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE key TEXT := btrim(value); parts TEXT[]; first_day DATE; last_day DATE; year_no INTEGER;
BEGIN
  IF key ~ '^[0-9]{4}$' THEN RETURN key::INTEGER BETWEEN 1900 AND 9999; END IF;
  parts := regexp_match(key, '^([0-9]{4})[[:space:]-]?([QqHh])([1-4])$');
  IF parts IS NOT NULL THEN
    RETURN parts[1]::INTEGER BETWEEN 1900 AND 9999 AND (upper(parts[2])='Q' OR parts[3]::INTEGER<=2);
  END IF;
  parts := regexp_match(key, '^([0-9]{4}-[0-9]{2}-[0-9]{2})/([0-9]{4}-[0-9]{2}-[0-9]{2})$');
  IF parts IS NULL THEN RETURN false; END IF;
  first_day := parts[1]::DATE; last_day := parts[2]::DATE;
  RETURN first_day <= last_day AND first_day >= DATE '1900-01-01'
    AND last_day <= DATE '9999-12-31'
    AND to_char(first_day,'YYYY-MM-DD')=parts[1] AND to_char(last_day,'YYYY-MM-DD')=parts[2];
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;
CREATE FUNCTION yucer_gtm.strategy_period_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, yucer_gtm AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.period=OLD.period
    AND NOT (OLD.status='draft' AND NEW.version_no IS NOT NULL) THEN RETURN NEW; END IF;
  -- Revising an unplaceable legacy publication must remain possible; its new
  -- draft must receive real dates before it can be released again.
  IF TG_OP='INSERT' AND NEW.status='draft' AND NEW.base_plan_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM yucer_gtm.strategy_plan b WHERE b.workspace_id=NEW.workspace_id
      AND b.id=NEW.base_plan_id AND b.period=NEW.period) THEN RETURN NEW; END IF;
  IF NOT COALESCE(yucer_gtm.strategy_period_valid(NEW.period),false) THEN RAISE EXCEPTION 'period_invalid'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER strategy_period_guard BEFORE INSERT OR UPDATE ON yucer_gtm.strategy_plan
  FOR EACH ROW EXECUTE FUNCTION yucer_gtm.strategy_period_guard();
REVOKE ALL ON FUNCTION yucer_gtm.strategy_period_valid(TEXT), yucer_gtm.strategy_period_guard() FROM PUBLIC;
COMMIT;
