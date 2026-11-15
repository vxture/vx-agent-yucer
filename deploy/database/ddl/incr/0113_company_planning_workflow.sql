-- Company-first publication and immutable company baselines for regional drafts.
-- No table or column changes; existing unscoped snapshots remain readable.
BEGIN;
CREATE OR REPLACE FUNCTION yucer_gtm.check_sales_plan_document(doc JSONB, publish BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE t JSONB; p JSONB; r JSONB; b JSONB; x JSONB; tier TEXT; field TEXT; n NUMERIC; total NUMERIC; prev NUMERIC; root JSONB; child_count INTEGER;
BEGIN
  IF doc->>'schemaVersion' IS DISTINCT FROM '1' OR COALESCE(doc->>'year','') !~ '^[0-9]{4}$' OR (doc->>'year')::int NOT BETWEEN 2000 AND 2200 OR octet_length(doc::text) > 1000000 THEN RAISE EXCEPTION 'invalid_plan'; END IF;
  FOREACH field IN ARRAY ARRAY['periods','regions','targets','budgets','contributions','team','actions'] LOOP
    IF jsonb_typeof(doc->field) IS DISTINCT FROM 'array' OR jsonb_array_length(doc->field) > 2000 THEN RAISE EXCEPTION 'invalid_plan'; END IF;
    IF field IN ('periods','regions') THEN tier := CASE WHEN field = 'regions' THEN 'id' ELSE 'key' END; ELSE tier := 'key'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(doc->field) z GROUP BY z->>tier HAVING count(*) > 1 OR COALESCE(z->>tier,'')='' OR length(z->>tier)>160) THEN RAISE EXCEPTION 'duplicate_line'; END IF;
  END LOOP;
  FOREACH field IN ARRAY ARRAY['assumptions','allocationNote','capacityNote'] LOOP
    IF jsonb_typeof(doc->field) IS DISTINCT FROM 'string' OR length(doc->>field) > 8000 THEN RAISE EXCEPTION 'invalid_plan'; END IF;
  END LOOP;
  SELECT z INTO root FROM jsonb_array_elements(doc->'periods') z WHERE z->>'key' = 'Y'||(doc->>'year');
  IF root IS NULL OR root->>'parent' IS NOT NULL OR root->>'start' <> doc->>'year'||'-01-01' OR root->>'end' <> ((doc->>'year')::int+1)::text||'-01-01' THEN RAISE EXCEPTION 'invalid_period'; END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(doc->'periods') LOOP
    IF COALESCE(p->>'key','')='' OR COALESCE(p->>'start','')='' OR COALESCE(p->>'end','')='' OR (p->>'start')::date >= (p->>'end')::date OR NOT (p->>'key' ~ '^Y[0-9]{4}$|^[0-9]{4}Q[1-4]$|^[0-9]{4}-(0[1-9]|1[0-2])$') THEN RAISE EXCEPTION 'invalid_period'; END IF;
    IF p <> root AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'periods') q WHERE q->>'key' = p->>'parent' AND q->>'start' <= p->>'start' AND q->>'end' >= p->>'end' AND (q->>'start' < p->>'start' OR q->>'end' > p->>'end')) THEN RAISE EXCEPTION 'invalid_period'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'periods') q WHERE q->>'key' <> p->>'key' AND q->>'parent' IS NOT DISTINCT FROM p->>'parent' AND q->>'start' < p->>'end' AND p->>'start' < q->>'end') THEN RAISE EXCEPTION 'overlapping_period'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'periods') z WHERE (CASE WHEN z->>'key' ~ '^Y[0-9]{4}$' THEN make_date(substring(z->>'key',2,4)::int,1,1) WHEN z->>'key' ~ '^[0-9]{4}Q[1-4]$' THEN make_date(substring(z->>'key',1,4)::int,(right(z->>'key',1)::int-1)*3+1,1) ELSE (z->>'key'||'-01')::date END) IS DISTINCT FROM (z->>'start')::date OR (z->>'end')::date IS DISTINCT FROM ((z->>'start')::date + CASE WHEN z->>'key' ~ '^Y' THEN interval '1 year' WHEN z->>'key' ~ 'Q' THEN interval '3 months' ELSE interval '1 month' END)::date) THEN RAISE EXCEPTION 'invalid_period'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'targets') z GROUP BY z->>'scope',z->>'period',z->>'metric',z->>'currency' HAVING count(*) > 1) THEN RAISE EXCEPTION 'duplicate_line'; END IF;
  FOR t IN SELECT * FROM jsonb_array_elements(doc->'targets') LOOP
    IF COALESCE(t->>'scope','')='' OR COALESCE(t->>'metric','') NOT IN ('revenue','pipeline','new_logo','margin') OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'periods') z WHERE z->>'key'=t->>'period') OR (t->>'scope' <> 'workspace' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'regions') z WHERE 'territory:'||(z->>'id')=t->>'scope' AND (z->>'included')::boolean)) OR t->>'metric' NOT IN ('revenue','pipeline','new_logo','margin') THEN RAISE EXCEPTION 'invalid_target'; END IF;
    IF (t->>'metric'='new_logo' AND t->>'currency' IS NOT NULL) OR (t->>'metric'<>'new_logo' AND COALESCE(t->>'currency','') !~ '^[A-Z]{3}$') THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
    prev := NULL;
    FOREACH tier IN ARRAY ARRAY['floor','target','stretch'] LOOP
      IF NOT (t ? tier) THEN RAISE EXCEPTION 'invalid_target'; END IF;
      IF t->>tier IS NOT NULL THEN
        IF t->>tier !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'invalid_amount'; END IF;
        n := (t->>tier)::numeric;
        IF (t->>'metric'='new_logo' AND n <> trunc(n)) OR (prev IS NOT NULL AND n < prev) THEN RAISE EXCEPTION 'target_ladder'; END IF; prev := n;
        SELECT sum((z->>tier)::numeric),count(*) INTO total,child_count FROM jsonb_array_elements(doc->'targets') z WHERE z->>'metric'=t->>'metric' AND z->>'currency' IS NOT DISTINCT FROM t->>'currency' AND z->>'period'=t->>'period' AND z->>'scope'<>'workspace' AND t->>'scope'='workspace';
        IF total > n THEN RAISE EXCEPTION 'overallocated'; END IF;
        IF publish AND child_count > 0 AND (total IS NULL OR total<n OR EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'targets') z WHERE z->>'metric'=t->>'metric' AND z->>'currency' IS NOT DISTINCT FROM t->>'currency' AND z->>'period'=t->>'period' AND z->>'scope'<>'workspace' AND t->>'scope'='workspace' AND z->>tier IS NULL)) AND btrim(doc->>'allocationNote')='' THEN RAISE EXCEPTION 'allocation_note_required'; END IF;
        IF t->>'metric' <> 'pipeline' AND tier='target' THEN
          SELECT sum((z->>tier)::numeric),count(*) INTO total,child_count FROM jsonb_array_elements(doc->'targets') z JOIN jsonb_array_elements(doc->'periods') q ON q->>'key'=z->>'period' WHERE z->>'metric'=t->>'metric' AND z->>'currency' IS NOT DISTINCT FROM t->>'currency' AND z->>'scope'=t->>'scope' AND q->>'parent'=t->>'period';
          IF total > n THEN RAISE EXCEPTION 'overallocated'; END IF;
          IF publish AND child_count > 0 AND (total IS NULL OR total<n) AND btrim(doc->>'allocationNote')='' THEN RAISE EXCEPTION 'allocation_note_required'; END IF;
        END IF;
      ELSIF publish AND tier='target' THEN RAISE EXCEPTION 'target_required'; END IF;
    END LOOP;
  END LOOP;
  IF publish AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'targets') z WHERE z->>'scope'='workspace' AND z->>'period'=root->>'key' AND z->>'metric'='revenue') THEN RAISE EXCEPTION 'workspace_target_required'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(doc->'regions') LOOP
    IF COALESCE(btrim(r->>'name'),'')='' OR jsonb_typeof(r->'included') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_region'; END IF;
    IF publish AND (r->>'included')::boolean AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'targets') z WHERE z->>'scope'='territory:'||(r->>'id') AND z->>'period'=root->>'key' AND z->>'metric'='revenue') THEN RAISE EXCEPTION 'region_target_required'; END IF;
    IF publish AND NOT (r->>'included')::boolean AND COALESCE(btrim(r->>'reason'),'')='' THEN RAISE EXCEPTION 'exclusion_reason_required'; END IF;
  END LOOP;
  IF publish AND doc->>'releaseScope' IS DISTINCT FROM 'company' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'regions') z WHERE (z->>'included')::boolean) AND btrim(doc->>'allocationNote')='' THEN RAISE EXCEPTION 'allocation_note_required'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'budgets') z GROUP BY z->>'accountId',z->>'period',z->>'metric',z->>'currency' HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate_line'; END IF;
  FOR b IN SELECT * FROM jsonb_array_elements(doc->'budgets') LOOP
    IF COALESCE(b->>'accountId','')='' OR COALESCE(btrim(b->>'name'),'')='' OR COALESCE(b->>'metric','') NOT IN ('revenue','pipeline','new_logo','margin') OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'periods') z WHERE z->>'key'=b->>'period') OR (b->>'metric'='new_logo' AND b->>'currency' IS NOT NULL) OR (b->>'metric'<>'new_logo' AND COALESCE(b->>'currency','') !~ '^[A-Z]{3}$') THEN RAISE EXCEPTION 'invalid_budget'; END IF;
    IF COALESCE(b->>'amount','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    IF b->>'metric'='new_logo' AND (b->>'amount')::numeric <> trunc((b->>'amount')::numeric) THEN RAISE EXCEPTION 'count_integer'; END IF;
    SELECT sum((z->>'amount')::numeric) INTO total FROM jsonb_array_elements(doc->'contributions') z WHERE z->>'budgetKey'=b->>'key';
    IF total > (b->>'amount')::numeric THEN RAISE EXCEPTION 'budget_overallocated'; END IF;
    IF publish AND b->>'sourcePlanId' IS NULL AND COALESCE(btrim(b->>'note'),'')='' THEN RAISE EXCEPTION 'budget_basis_required'; END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(doc->'contributions') LOOP
    IF COALESCE(x->>'responsibility','') NOT IN ('primary','support') OR COALESCE(x->>'amount','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'budgets') z JOIN jsonb_array_elements(doc->'targets') q ON q->>'key'=x->>'targetKey' AND q->>'scope'='territory:'||(x->>'regionId') AND q->>'period'=z->>'period' AND q->>'metric'=z->>'metric' AND q->>'currency' IS NOT DISTINCT FROM z->>'currency' WHERE z->>'key'=x->>'budgetKey') THEN RAISE EXCEPTION 'invalid_contribution'; END IF;
  END LOOP;
  FOR t IN SELECT * FROM jsonb_array_elements(doc->'targets') LOOP
    SELECT sum((z->>'amount')::numeric) INTO total FROM jsonb_array_elements(doc->'contributions') z WHERE z->>'targetKey'=t->>'key';
    IF total > (t->>'target')::numeric THEN RAISE EXCEPTION 'contribution_overallocated'; END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(doc->'team') LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'regions') z WHERE z->>'id'=x->>'regionId' AND (z->>'included')::boolean) OR COALESCE(btrim(x->>'role'),'')='' OR COALESCE(x->>'percent','')='' OR COALESCE(x->>'start','')='' OR COALESCE(x->>'end','')='' OR (x->>'percent')::numeric NOT BETWEEN 0 AND 100 OR x->>'start' >= x->>'end' OR x->>'start'<root->>'start' OR x->>'end'>root->>'end' THEN RAISE EXCEPTION 'invalid_resource'; END IF;
    IF (x->>'memberSub' IS NOT NULL AND x->>'requestedFte' IS NOT NULL) OR (x->>'memberSub' IS NULL AND (COALESCE(x->>'requestedFte','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' OR (x->>'requestedFte')::numeric<=0)) THEN RAISE EXCEPTION 'invalid_resource'; END IF;
    IF x->>'memberSub' IS NOT NULL THEN
      SELECT max(s.total) INTO total FROM (SELECT sum((z->>'percent')::numeric) total FROM jsonb_array_elements(doc->'team') z CROSS JOIN jsonb_array_elements(doc->'team') q WHERE z->>'memberSub'=x->>'memberSub' AND q->>'memberSub'=x->>'memberSub' AND z->>'start' <= q->>'start' AND q->>'start' < z->>'end' GROUP BY q->>'key') s;
      IF publish AND total > 100 AND COALESCE(btrim(doc->>'capacityNote'),'')='' THEN RAISE EXCEPTION 'capacity_note_required'; END IF;
    END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(doc->'actions') LOOP
    IF COALESCE(btrim(x->>'objective'),'')='' OR COALESCE(x->>'due','')='' OR jsonb_typeof(x->'evidenceRefs') IS DISTINCT FROM 'array' OR (publish AND COALESCE(x->>'ownerSub','')='') OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'regions') z WHERE z->>'id'=x->>'regionId' AND (z->>'included')::boolean) OR (x->>'due')::date < (root->>'start')::date OR (x->>'due')::date >= (root->>'end')::date OR (x->>'targetKey' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'targets') z WHERE z->>'key'=x->>'targetKey' AND z->>'scope'='territory:'||(x->>'regionId'))) THEN RAISE EXCEPTION 'invalid_action'; END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION yucer_gtm.sales_plan_company_slice(doc JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('periods', doc->'periods', 'targets',
    COALESCE((SELECT jsonb_agg(z) FROM jsonb_array_elements(doc->'targets') z
      WHERE z->>'scope'='workspace'),'[]'::jsonb));
$$;
CREATE OR REPLACE FUNCTION yucer_gtm.sales_plan_regional_slice(doc JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('regions', COALESCE(doc->'regions','[]'::jsonb), 'targets',
    COALESCE((SELECT jsonb_agg(z) FROM jsonb_array_elements(doc->'targets') z
      WHERE z->>'scope'<>'workspace'),'[]'::jsonb),
    'budgets',COALESCE(doc->'budgets','[]'::jsonb),
    'contributions',COALESCE(doc->'contributions','[]'::jsonb),
    'team',COALESCE(doc->'team','[]'::jsonb),
    'actions',COALESCE(doc->'actions','[]'::jsonb));
$$;
CREATE OR REPLACE FUNCTION yucer_gtm.guard_sales_plan_workflow()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE base yucer_gtm.sales_plan_revision; company yucer_gtm.sales_plan_revision; basis TEXT;
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
    IF yucer_gtm.sales_plan_regional_slice(NEW.content) IS DISTINCT FROM yucer_gtm.sales_plan_regional_slice(base.content) THEN
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
DROP TRIGGER IF EXISTS guard_sales_plan_workflow ON yucer_gtm.sales_plan_revision;
CREATE TRIGGER guard_sales_plan_workflow BEFORE INSERT OR UPDATE ON yucer_gtm.sales_plan_revision
  FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_sales_plan_workflow();
COMMIT;
