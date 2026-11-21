-- Persist editable acquisition assumptions; never reinterpret legacy explicit counts.
BEGIN;
CREATE FUNCTION yucer_gtm.check_sales_plan_new_logo_estimates(doc JSONB)
RETURNS VOID LANGUAGE plpgsql SET search_path=pg_catalog,yucer_gtm AS $$
DECLARE t JSONB; basis JSONB; revenue JSONB; expected NUMERIC;
BEGIN
 doc:=yucer_gtm.sales_plan_validation_document(doc);
 FOR t IN SELECT * FROM jsonb_array_elements(doc->'targets') LOOP
  IF NOT t ? 'newLogoEstimate' THEN CONTINUE; END IF;
  basis:=t->'newLogoEstimate';
  IF t->>'metric' IS DISTINCT FROM 'new_logo' OR t->>'period' IS DISTINCT FROM 'Y'||(doc->>'year') OR jsonb_typeof(basis) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_new_logo_estimate'; END IF;
  IF jsonb_typeof(basis->'preset') IS DISTINCT FROM 'string' OR basis->>'preset' NOT IN ('general','software','projects','equipment','subscription','custom') OR jsonb_typeof(basis->'currency') IS DISTINCT FROM 'string' OR basis->>'currency' !~ '^[A-Z]{3}$' OR jsonb_typeof(basis->'automatic') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_new_logo_estimate'; END IF;
  IF jsonb_typeof(basis->'revenueShare') IS DISTINCT FROM 'string' OR basis->>'revenueShare' !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' OR jsonb_typeof(basis->'firstOrderAmount') IS DISTINCT FROM 'string' OR basis->>'firstOrderAmount' !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'invalid_new_logo_estimate'; END IF;
  IF (basis->>'revenueShare')::numeric>100 OR (basis->>'firstOrderAmount')::numeric<=0 THEN RAISE EXCEPTION 'invalid_new_logo_estimate'; END IF;
  SELECT z INTO revenue FROM jsonb_array_elements(doc->'targets') z WHERE z->>'scope'=t->>'scope' AND z->>'period'=t->>'period' AND z->>'metric'='revenue' AND z->>'currency'=basis->>'currency';
  IF revenue IS NULL THEN RAISE EXCEPTION 'new_logo_basis_mismatch'; END IF;
  IF (basis->>'automatic')::boolean THEN
   expected:=ceil((revenue->>'target')::numeric*(basis->>'revenueShare')::numeric/100/(basis->>'firstOrderAmount')::numeric);
   IF (t->>'target')::numeric IS DISTINCT FROM expected THEN RAISE EXCEPTION 'new_logo_basis_mismatch'; END IF;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION yucer_gtm.check_sales_plan_new_logo_estimates(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_gtm.check_sales_plan_new_logo_estimates(JSONB) TO yucer_svc;
CREATE FUNCTION yucer_gtm.guard_sales_plan_new_logo_estimates() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,yucer_gtm AS $$
BEGIN
 PERFORM yucer_gtm.check_sales_plan_new_logo_estimates(NEW.content);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION yucer_gtm.guard_sales_plan_new_logo_estimates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_gtm.guard_sales_plan_new_logo_estimates() TO yucer_svc;
CREATE TRIGGER sales_plan_new_logo_estimates_guard BEFORE INSERT OR UPDATE OF content ON yucer_gtm.sales_plan_revision
 FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_sales_plan_new_logo_estimates();
COMMIT;
