-- D1 expectations and D2 versioned strategic acceptance; UUID relationships only.
BEGIN;
ALTER TABLE yucer_gtm.strategy_plan ADD COLUMN expectations JSONB NOT NULL DEFAULT '[]';
GRANT UPDATE (expectations) ON yucer_gtm.strategy_plan TO yucer_svc;
CREATE FUNCTION yucer_gtm.valid_strategic_expectations(doc JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE x JSONB;
BEGIN
 IF jsonb_typeof(doc) IS DISTINCT FROM 'array' OR jsonb_array_length(doc)>3 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(doc) z GROUP BY z->>'id' HAVING count(*)>1) OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(doc) z GROUP BY z->>'metric' HAVING count(*)>1) THEN RETURN false; END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(doc) LOOP
  IF COALESCE(x->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' OR
   COALESCE(x->>'metric','') NOT IN ('revenue','channels','reference_cases') OR
   jsonb_typeof(x->'amount') IS DISTINCT FROM 'string' OR COALESCE(x->>'amount','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' OR
   (x->>'metric'<>'revenue' AND x->>'amount' !~ '^(0|[1-9][0-9]{0,8})$') OR
   (x->>'metric'='revenue' AND COALESCE(x->>'currency','') !~ '^[A-Z]{3}$') OR
   (x->>'metric'<>'revenue' AND x->'currency' IS DISTINCT FROM 'null'::jsonb) OR
   jsonb_typeof(x->'criterion') IS DISTINCT FROM 'string' OR length(x->>'criterion')>1000 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE yucer_gtm.strategy_plan ADD CONSTRAINT ck_strategy_expectations CHECK(yucer_gtm.valid_strategic_expectations(expectations));
CREATE FUNCTION yucer_gtm.guard_strategy_expectations() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.status<>'draft' AND OLD.expectations IS DISTINCT FROM NEW.expectations THEN RAISE EXCEPTION 'immutable_strategy'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.expectations) n JOIN yucer_gtm.strategy_plan p ON p.workspace_id=NEW.workspace_id AND p.lineage_id=NEW.lineage_id CROSS JOIN LATERAL jsonb_array_elements(p.expectations) previous_expectation WHERE previous_expectation->>'id'=n->>'id' AND previous_expectation->>'metric'<>n->>'metric') THEN RAISE EXCEPTION 'expectations_invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER strategy_expectations_guard BEFORE UPDATE ON yucer_gtm.strategy_plan FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_strategy_expectations();

CREATE OR REPLACE FUNCTION yucer_gtm.strategy_version_snapshot(ws UUID, pid UUID, legacy BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE SQL STABLE SET search_path = pg_catalog, yucer_gtm AS $$
SELECT jsonb_build_object(
  'schemaVersion',1,'legacy',legacy,'capturedAt',statement_timestamp(),
  'strategyTypeId',p.strategy_type_id,'strategyType',(SELECT jsonb_build_object('id',t.id,'code',t.code,'name',t.name,'description',t.description,'theme',t.theme,'enabled',t.enabled,'sortOrder',t.sort_order) FROM yucer_gtm.strategy_type t WHERE t.workspace_id=ws AND t.id=p.strategy_type_id),
  'expectations',p.expectations,'name',p.name,'period',p.period,'objective',p.objective,'ownerSub',p.owner_sub,
  'ownerName',(SELECT display_name FROM local_authz.member WHERE workspace_id=ws AND sub=p.owner_sub),
  'sharedSolutionIds',COALESCE((SELECT jsonb_agg(solution_id::text ORDER BY solution_id) FROM yucer_gtm.strategy_plan_solution WHERE workspace_id=ws AND plan_id=pid),'[]'),
  'solutions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'solutionCode',s.solution_code,'status',s.status) ORDER BY s.id)
    FROM yucer_catalog.solution s WHERE s.workspace_id=ws AND s.id IN (
      SELECT solution_id FROM yucer_gtm.strategy_plan_solution WHERE workspace_id=ws AND plan_id=pid
      UNION SELECT solution_id FROM yucer_gtm.strategy_plan_market_solution WHERE workspace_id=ws AND plan_id=pid)),'[]'),
  'sharedProductIds',COALESCE((SELECT jsonb_agg(product_id::text ORDER BY product_id) FROM yucer_gtm.strategy_plan_product WHERE workspace_id=ws AND plan_id=pid),'[]'),
  'products',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'productCode',s.product_code,'status',CASE WHEN st.status_code='retired' THEN 'retired' ELSE 'active' END) ORDER BY s.id)
    FROM yucer_catalog.product s JOIN yucer_catalog.product_status st ON st.workspace_id=s.workspace_id AND st.id=s.status_id WHERE s.workspace_id=ws AND s.id IN (
      SELECT product_id FROM yucer_gtm.strategy_plan_product WHERE workspace_id=ws AND plan_id=pid
      UNION SELECT product_id FROM yucer_gtm.strategy_plan_market_product WHERE workspace_id=ws AND plan_id=pid)),'[]'),
  'targetMarkets',COALESCE((SELECT jsonb_agg(jsonb_build_object('segmentId',m.segment_id,'marketName',m.market_name,'criteria',m.criteria,'intent',m.intent,'approach',m.approach,
    'solutionIds',COALESCE((SELECT jsonb_agg(solution_id::text ORDER BY solution_id) FROM yucer_gtm.strategy_plan_market_solution WHERE workspace_id=ws AND plan_id=pid AND segment_id=m.segment_id),'[]'),
    'productIds',COALESCE((SELECT jsonb_agg(product_id::text ORDER BY product_id) FROM yucer_gtm.strategy_plan_market_product WHERE workspace_id=ws AND plan_id=pid AND segment_id=m.segment_id),'[]')) ORDER BY m.segment_id)
    FROM yucer_gtm.strategy_plan_market m WHERE m.workspace_id=ws AND m.plan_id=pid),'[]'))
FROM yucer_gtm.strategy_plan p WHERE p.workspace_id=ws AND p.id=pid
$$;

CREATE OR REPLACE FUNCTION yucer_gtm.revise_strategy_plan(ws UUID, base UUID, actor TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE source yucer_gtm.strategy_plan; latest UUID; draft UUID;
BEGIN
  IF COALESCE(btrim(actor),'')='' OR length(actor)>128 THEN RAISE EXCEPTION 'invalid_actor'; END IF;
  SELECT * INTO source FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND id=base;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy_not_found'; END IF;
  PERFORM 1 FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND id=source.lineage_id FOR UPDATE;
  SELECT * INTO source FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND id=base FOR UPDATE;
  SELECT id INTO latest FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND lineage_id=source.lineage_id AND version_no IS NOT NULL ORDER BY version_no DESC LIMIT 1;
  IF latest IS DISTINCT FROM base OR source.status NOT IN ('approved','active') THEN RAISE EXCEPTION 'strategy_not_revisable'; END IF;
  SELECT id INTO draft FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND lineage_id=source.lineage_id AND status='draft';
  IF draft IS NOT NULL THEN RETURN draft; END IF;
  draft := gen_random_uuid();
  INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,lineage_id,base_plan_id,plan_no,name,period,objective,owner_sub,created_by_sub,strategy_type_id,expectations)
    VALUES(draft,ws,source.lineage_id,base,source.plan_no,source.name,source.period,source.objective,source.owner_sub,actor,source.strategy_type_id,source.expectations);
  INSERT INTO yucer_gtm.strategy_plan_solution SELECT workspace_id,draft,solution_id FROM yucer_gtm.strategy_plan_solution WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_product SELECT workspace_id,draft,product_id FROM yucer_gtm.strategy_plan_product WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market(workspace_id,plan_id,segment_id,intent,approach,market_name,criteria)
    SELECT workspace_id,draft,segment_id,intent,approach,market_name,criteria FROM yucer_gtm.strategy_plan_market WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market_solution SELECT workspace_id,draft,segment_id,solution_id FROM yucer_gtm.strategy_plan_market_solution WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market_product SELECT workspace_id,draft,segment_id,product_id FROM yucer_gtm.strategy_plan_market_product WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_event(workspace_id,lineage_id,plan_id,kind,actor_sub) VALUES(ws,source.lineage_id,draft,'revision',actor);
  RETURN draft;
END $$;

CREATE OR REPLACE FUNCTION yucer_gtm.sales_plan_company_slice(doc JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('strategyAcceptances',COALESCE((SELECT jsonb_agg(z-'allocations') FROM jsonb_array_elements(COALESCE(doc->'strategyAcceptances','[]')) z),'[]'), 'periods', doc->'periods', 'targets',
    COALESCE((SELECT jsonb_agg(z) FROM jsonb_array_elements(doc->'targets') z
      WHERE z->>'scope'='workspace'),'[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION yucer_gtm.sales_plan_regional_slice(doc JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('strategyAllocations',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',z->'key','allocations',z->'allocations')) FROM jsonb_array_elements(COALESCE(doc->'strategyAcceptances','[]')) z WHERE jsonb_array_length(z->'allocations')>0),'[]'), 'regions', COALESCE(doc->'regions','[]'::jsonb), 'targets',
    COALESCE((SELECT jsonb_agg(z) FROM jsonb_array_elements(doc->'targets') z
      WHERE z->>'scope'<>'workspace'),'[]'::jsonb),
    'budgets',COALESCE(doc->'budgets','[]'::jsonb),
    'contributions',COALESCE(doc->'contributions','[]'::jsonb),
    'team',COALESCE(doc->'team','[]'::jsonb),
    'actions',COALESCE(doc->'actions','[]'::jsonb));
$$;

CREATE FUNCTION yucer_gtm.strategy_execution_window(value TEXT) RETURNS DATERANGE
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE parts TEXT[]; year_no INT; month_no INT; first_day DATE; last_day DATE;
BEGIN
 IF NOT yucer_gtm.strategy_period_valid(value) THEN RETURN NULL; END IF;
 IF value ~ '^[0-9]{4}$' THEN RETURN daterange(make_date(value::int,1,1),make_date(value::int+1,1,1),'[)'); END IF;
 parts:=regexp_match(value,'^([0-9]{4})[[:space:]-]?([QqHh])([1-4])$');
 IF parts IS NOT NULL THEN
  month_no:=(parts[3]::int-1)*CASE WHEN upper(parts[2])='Q' THEN 3 ELSE 6 END+1;
  first_day:=make_date(parts[1]::int,month_no,1);
  RETURN daterange(first_day,(first_day + CASE WHEN upper(parts[2])='Q' THEN interval '3 months' ELSE interval '6 months' END)::date,'[)');
 END IF;
 parts:=string_to_array(value,'/'); RETURN daterange(parts[1]::date,parts[2]::date,'[]');
END $$;
CREATE FUNCTION yucer_gtm.guard_strategy_acceptances() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,yucer_gtm AS $$
DECLARE doc JSONB:=NEW.content; rows JSONB:=COALESCE(NEW.content->'strategyAcceptances','[]'); x JSONB; allocation_row JSONB; target_row JSONB; source yucer_gtm.strategy_plan; total NUMERIC; execution_window DATERANGE;
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
CREATE TRIGGER sales_plan_strategy_guard BEFORE INSERT OR UPDATE OF content,state ON yucer_gtm.sales_plan_revision FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_strategy_acceptances();
CREATE OR REPLACE FUNCTION yucer_gtm.sales_plan_closed_slice(doc JSONB, pkey TEXT)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE p JSONB; periods JSONB; targets JSONB; budgets JSONB; contributions JSONB; team JSONB;
BEGIN
  SELECT z INTO p FROM jsonb_array_elements(doc->'periods') z WHERE z->>'key'=pkey;
  IF p IS NULL THEN RAISE EXCEPTION 'closed_period_changed'; END IF;
  SELECT COALESCE(jsonb_agg(z ORDER BY z::text),'[]') INTO periods FROM jsonb_array_elements(doc->'periods') z WHERE z->>'start'>=p->>'start' AND z->>'end'<=p->>'end';
  SELECT COALESCE(jsonb_agg(z ORDER BY z::text),'[]') INTO targets FROM jsonb_array_elements(doc->'targets') z WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(periods) q WHERE q->>'key'=z->>'period');
  SELECT COALESCE(jsonb_agg(z ORDER BY z::text),'[]') INTO budgets FROM jsonb_array_elements(doc->'budgets') z WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(periods) q WHERE q->>'key'=z->>'period');
  SELECT COALESCE(jsonb_agg(z ORDER BY z::text),'[]') INTO contributions FROM jsonb_array_elements(doc->'contributions') z WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(targets) q WHERE q->>'key'=z->>'targetKey') OR EXISTS (SELECT 1 FROM jsonb_array_elements(budgets) q WHERE q->>'key'=z->>'budgetKey');
  SELECT COALESCE(jsonb_agg(x ORDER BY x::text),'[]') INTO team FROM (SELECT (z-'key'-'start'-'end')||jsonb_build_object('start',greatest(z->>'start',p->>'start'),'end',least(z->>'end',p->>'end')) x FROM jsonb_array_elements(doc->'team') z WHERE z->>'start'<p->>'end' AND z->>'end'>p->>'start') q;
  RETURN jsonb_build_object('periods',periods,'targets',targets,'budgets',budgets,'contributions',contributions,'team',team,'regions',doc->'regions','strategyAcceptances',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',z->'key','strategyId',z->'strategyId','lineageId',z->'lineageId','version',z->'version','period',z->'period','expectation',z->'expectation','allocations',cells) ORDER BY z->>'key') FROM jsonb_array_elements(COALESCE(doc->'strategyAcceptances','[]')) z CROSS JOIN LATERAL (SELECT jsonb_agg(a ORDER BY a::text) cells FROM jsonb_array_elements(z->'allocations') a WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(periods) q WHERE q->>'key'=a->>'period')) included WHERE cells IS NOT NULL),'[]'),'actions',(SELECT COALESCE(jsonb_agg(z ORDER BY z::text),'[]') FROM jsonb_array_elements(doc->'actions') z WHERE z->>'due'>=p->>'start' AND z->>'due'<p->>'end'));
END $$;

COMMIT;
