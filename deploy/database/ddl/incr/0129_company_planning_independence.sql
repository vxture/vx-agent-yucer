-- Company validation excludes carried regional history. The existing workflow
-- trigger still requires the entire regional slice to equal its sealed base.
BEGIN;
CREATE FUNCTION yucer_gtm.sales_plan_validation_document(doc JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE WHEN doc->>'releaseScope'='company' THEN doc || jsonb_build_object(
    'targets',COALESCE((SELECT jsonb_agg(z) FROM jsonb_array_elements(doc->'targets') z WHERE z->>'scope'='workspace'),'[]'),
    'regions','[]'::jsonb,'budgets','[]'::jsonb,'contributions','[]'::jsonb,'team','[]'::jsonb,'actions','[]'::jsonb,
    'strategyAcceptances',COALESCE((SELECT jsonb_agg(z || jsonb_build_object('allocations','[]'::jsonb)) FROM jsonb_array_elements(COALESCE(doc->'strategyAcceptances','[]')) z),'[]')
  ) ELSE doc END;
$$;
REVOKE ALL ON FUNCTION yucer_gtm.sales_plan_validation_document(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_gtm.sales_plan_validation_document(JSONB) TO yucer_svc;

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
  doc := yucer_gtm.sales_plan_validation_document(doc);
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

CREATE OR REPLACE FUNCTION yucer_gtm.guard_strategy_acceptances() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,yucer_gtm AS $$
DECLARE doc JSONB:=yucer_gtm.sales_plan_validation_document(NEW.content); rows JSONB:=COALESCE(doc->'strategyAcceptances','[]'); x JSONB; allocation_row JSONB; target_row JSONB; source yucer_gtm.strategy_plan; total NUMERIC; execution_window DATERANGE;
BEGIN
 IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows)>300 THEN RAISE EXCEPTION 'strategy_acceptance_invalid'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) z GROUP BY z->>'key' HAVING count(*)>1) OR
 EXISTS(SELECT 1 FROM jsonb_array_elements(rows) z GROUP BY z->>'lineageId',z->'expectation'->>'metric' HAVING count(*)>1) THEN RAISE EXCEPTION 'strategy_duplicate'; END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(rows) LOOP
  IF COALESCE(x->>'key','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' OR
    NOT yucer_gtm.valid_strategic_expectations(jsonb_build_array(x->'expectation')) OR
    jsonb_typeof(x->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(x->'allocations')>500 OR
    COALESCE(x->>'amount','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' OR
    jsonb_typeof(x->'note') IS DISTINCT FROM 'string' OR length(x->>'note')>1000 THEN RAISE EXCEPTION 'strategy_acceptance_invalid'; END IF;
  SELECT * INTO source FROM yucer_gtm.strategy_plan WHERE workspace_id=NEW.workspace_id AND id=(x->>'strategyId')::uuid;
  IF source.version_no IS NULL OR source.lineage_id IS DISTINCT FROM (x->>'lineageId')::uuid OR source.version_no IS DISTINCT FROM (x->>'version')::int OR
    source.published_snapshot->>'name' IS DISTINCT FROM x->>'name' OR source.published_snapshot->>'period' IS DISTINCT FROM x->>'period' OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source.published_snapshot->'expectations') z WHERE z=x->'expectation') THEN RAISE EXCEPTION 'strategy_source_changed'; END IF;
  execution_window:=yucer_gtm.strategy_execution_window(x->>'period');
  IF execution_window IS NULL OR NOT execution_window && daterange(make_date((doc->>'year')::int,1,1),make_date((doc->>'year')::int+1,1,1),'[)') THEN RAISE EXCEPTION 'strategy_period_mismatch'; END IF;
  IF x->'expectation'->>'metric'<>'revenue' AND (x->>'amount')::numeric<>trunc((x->>'amount')::numeric) THEN RAISE EXCEPTION 'count_integer'; END IF;
  IF NEW.state='sealed' AND (COALESCE(btrim(x->>'ownerSub'),'')='' OR (x->'expectation'->>'metric'<>'revenue' AND COALESCE(btrim(x->'expectation'->>'criterion'),'')='' AND btrim(x->>'note')='')) THEN RAISE EXCEPTION 'strategy_owner_required'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(x->'allocations') z GROUP BY z->>'key' HAVING count(*)>1) OR
     EXISTS(SELECT 1 FROM jsonb_array_elements(x->'allocations') z GROUP BY z->>'regionId',z->>'period' HAVING count(*)>1) THEN RAISE EXCEPTION 'strategy_allocation_invalid'; END IF;
  FOR allocation_row IN SELECT * FROM jsonb_array_elements(x->'allocations') LOOP
    IF COALESCE(allocation_row->>'key','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' OR COALESCE(allocation_row->>'amount','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' OR
      NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'regions') z WHERE z->>'id'=allocation_row->>'regionId' AND (z->>'included')::boolean) OR
      NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'periods') z WHERE z->>'key'=allocation_row->>'period' AND z->>'parent'='Y'||(doc->>'year') AND daterange((z->>'start')::date,(z->>'end')::date,'[)') && execution_window) THEN RAISE EXCEPTION 'strategy_allocation_invalid'; END IF;
    IF x->'expectation'->>'metric'='revenue' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'targets') t WHERE t->>'scope'='territory:'||(allocation_row->>'regionId') AND t->>'period'=allocation_row->>'period' AND t->>'metric'='revenue' AND t->>'currency'=x->'expectation'->>'currency' AND t->>'target' IS NOT NULL AND (allocation_row->>'amount')::numeric<=(t->>'target')::numeric) THEN RAISE EXCEPTION 'strategy_overallocated'; END IF;
    IF x->'expectation'->>'metric'<>'revenue' AND (allocation_row->>'amount')::numeric<>trunc((allocation_row->>'amount')::numeric) THEN RAISE EXCEPTION 'count_integer'; END IF;
    IF NEW.state='sealed' AND COALESCE(btrim(allocation_row->>'ownerSub'),'')='' THEN RAISE EXCEPTION 'strategy_owner_required'; END IF;
  END LOOP;
  SELECT COALESCE(sum((z->>'amount')::numeric),0) INTO total FROM jsonb_array_elements(x->'allocations') z;
  IF total>(x->>'amount')::numeric THEN RAISE EXCEPTION 'strategy_overallocated'; END IF;
 END LOOP;
 FOR target_row IN SELECT * FROM jsonb_array_elements(doc->'targets') WHERE value->>'metric'='revenue' LOOP
  IF target_row->>'scope'='workspace' AND target_row->>'period'='Y'||(doc->>'year') THEN
    SELECT sum((z->>'amount')::numeric) INTO total FROM jsonb_array_elements(rows) z WHERE z->'expectation'->>'metric'='revenue' AND z->'expectation'->>'currency'=target_row->>'currency';
  ELSE
    SELECT sum((a->>'amount')::numeric) INTO total FROM jsonb_array_elements(rows) z CROSS JOIN LATERAL jsonb_array_elements(z->'allocations') a
    WHERE z->'expectation'->>'metric'='revenue' AND z->'expectation'->>'currency'=target_row->>'currency' AND 'territory:'||(a->>'regionId')=target_row->>'scope'
     AND (a->>'period'=target_row->>'period' OR EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'periods') p WHERE p->>'key'=a->>'period' AND p->>'parent'=target_row->>'period'));
  END IF;
  IF total IS NOT NULL AND (target_row->>'target' IS NULL OR total>(target_row->>'target')::numeric) THEN RAISE EXCEPTION 'strategy_overallocated'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) z WHERE z->'expectation'->>'metric'='revenue' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'targets') t WHERE t->>'scope'='workspace' AND t->>'period'='Y'||(doc->>'year') AND t->>'metric'='revenue' AND t->>'currency'=z->'expectation'->>'currency')) THEN RAISE EXCEPTION 'strategy_overallocated'; END IF;
 RETURN NEW;
END $$;
COMMIT;
