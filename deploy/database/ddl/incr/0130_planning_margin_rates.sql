-- Explicit annual gross-margin rates use the SAME baseline revenue target.
-- Existing frozen amount-only targets retain their original interpretation.
BEGIN;
CREATE FUNCTION yucer_gtm.check_sales_plan_margin_rates(doc JSONB)
RETURNS VOID LANGUAGE plpgsql SET search_path=pg_catalog,yucer_gtm AS $$
DECLARE t JSONB; rates JSONB; revenue JSONB; tier TEXT; value NUMERIC; previous NUMERIC; expected NUMERIC;
BEGIN
 doc:=yucer_gtm.sales_plan_validation_document(doc);
 FOR t IN SELECT * FROM jsonb_array_elements(doc->'targets') LOOP
  IF NOT t ? 'marginRates' THEN CONTINUE; END IF;
  rates:=t->'marginRates';
  IF t->>'metric' IS DISTINCT FROM 'margin' OR t->>'period' IS DISTINCT FROM 'Y'||(doc->>'year') OR jsonb_typeof(rates) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_margin_rate'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(rates))<>3 THEN RAISE EXCEPTION 'invalid_margin_rate'; END IF;
  SELECT z INTO revenue FROM jsonb_array_elements(doc->'targets') z WHERE z->>'scope'=t->>'scope' AND z->>'period'=t->>'period' AND z->>'metric'='revenue' AND z->>'currency' IS NOT DISTINCT FROM t->>'currency';
  previous:=NULL;
  FOREACH tier IN ARRAY ARRAY['floor','target','stretch'] LOOP
   IF NOT rates ? tier OR (rates->tier<>'null'::jsonb AND (jsonb_typeof(rates->tier) IS DISTINCT FROM 'string' OR rates->>tier !~ '^(0|[1-9][0-9]?)(\.[0-9]{1,2})?$|^100(\.0{1,2})?$')) THEN RAISE EXCEPTION 'invalid_margin_rate'; END IF;
   value:=(rates->>tier)::numeric;
   IF value IS NOT NULL AND previous IS NOT NULL AND value<previous THEN RAISE EXCEPTION 'target_ladder'; END IF;
   IF value IS NOT NULL THEN previous:=value; END IF;
   expected:=trunc((revenue->>'target')::numeric*value/100,2);
   IF (t->>tier)::numeric IS DISTINCT FROM expected THEN RAISE EXCEPTION 'margin_rate_mismatch'; END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION yucer_gtm.check_sales_plan_margin_rates(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_gtm.check_sales_plan_margin_rates(JSONB) TO yucer_svc;
CREATE FUNCTION yucer_gtm.guard_sales_plan_margin_rates() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,yucer_gtm AS $$
BEGIN
 PERFORM yucer_gtm.check_sales_plan_margin_rates(NEW.content);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION yucer_gtm.guard_sales_plan_margin_rates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_gtm.guard_sales_plan_margin_rates() TO yucer_svc;
CREATE TRIGGER sales_plan_margin_rates_guard BEFORE INSERT OR UPDATE OF content ON yucer_gtm.sales_plan_revision
 FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_sales_plan_margin_rates();
COMMIT;
