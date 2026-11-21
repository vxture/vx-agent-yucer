-- Company drafts can cancel whole strategic acceptances without editing regional history.
BEGIN;
CREATE OR REPLACE FUNCTION yucer_gtm.guard_sales_plan_workflow()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE base yucer_gtm.sales_plan_revision; company yucer_gtm.sales_plan_revision; basis TEXT; retained_base JSONB;
BEGIN
  SELECT * INTO base FROM yucer_gtm.sales_plan_revision
    WHERE id=NEW.base_revision_id AND plan_id=NEW.plan_id AND workspace_id=NEW.workspace_id;
  IF TG_OP='UPDATE' AND NEW.content->>'releaseScope' IS DISTINCT FROM OLD.content->>'releaseScope' THEN
    RAISE EXCEPTION 'company_basis_changed';
  END IF;
  IF NOT (NEW.content ? 'releaseScope') THEN
    IF NEW.content ? 'companyRevisionId' OR base.content ? 'releaseScope' THEN RAISE EXCEPTION 'company_basis_changed'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.content->>'releaseScope' NOT IN ('company','regions') OR jsonb_typeof(NEW.content->'releaseScope') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'invalid_plan';
  END IF;
  IF NEW.content->>'releaseScope'='company' THEN
    IF NEW.content ? 'companyRevisionId' THEN RAISE EXCEPTION 'company_basis_changed'; END IF;
    -- Cancellation may drop whole acceptances, while retained allocations and
    -- every other regional field remain identical to the published base.
    retained_base := base.content || jsonb_build_object('strategyAcceptances',
      COALESCE((SELECT jsonb_agg(x ORDER BY ordinal) FROM jsonb_array_elements(COALESCE(base.content->'strategyAcceptances','[]')) WITH ORDINALITY AS rows(x,ordinal)
        WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.content->'strategyAcceptances','[]')) n WHERE n->>'key'=x->>'key')),'[]'::jsonb));
    IF yucer_gtm.sales_plan_regional_slice(NEW.content) IS DISTINCT FROM yucer_gtm.sales_plan_regional_slice(retained_base) THEN
      RAISE EXCEPTION 'regional_draft_required';
    END IF;
  ELSE
    basis := CASE WHEN base.content->>'releaseScope'='regions' THEN base.content->>'companyRevisionId' ELSE base.id::text END;
    SELECT * INTO company FROM yucer_gtm.sales_plan_revision
      WHERE id::text=basis AND state='sealed' AND workspace_id=NEW.workspace_id AND plan_id=NEW.plan_id;
    IF company.id IS NULL OR NEW.content->>'companyRevisionId' IS DISTINCT FROM company.id::text THEN
      RAISE EXCEPTION 'company_release_required';
    END IF;
    IF yucer_gtm.sales_plan_company_slice(NEW.content) IS DISTINCT FROM yucer_gtm.sales_plan_company_slice(company.content) THEN
      RAISE EXCEPTION 'company_basis_changed';
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMIT;
