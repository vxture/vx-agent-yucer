-- Strategy result aggregate and configurable value/path dictionaries.
BEGIN;
CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_option (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK(kind IN ('value','path')),
  code VARCHAR(64) NOT NULL CHECK(code ~ '^[a-z][a-z0-9-]{0,63}$'),
  name VARCHAR(64) NOT NULL CHECK(length(btrim(name))>0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 9999),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,kind,code),
  UNIQUE(workspace_id,id)
);
GRANT SELECT,INSERT ON yucer_gtm.strategy_option TO yucer_svc;
REVOKE UPDATE,DELETE ON yucer_gtm.strategy_option FROM yucer_svc;
GRANT UPDATE(name,enabled,sort_order,updated_at) ON yucer_gtm.strategy_option TO yucer_svc;
ALTER TABLE yucer_gtm.strategy_plan ADD COLUMN result JSONB;
GRANT UPDATE(result) ON yucer_gtm.strategy_plan TO yucer_svc;
ALTER TABLE yucer_gtm.strategy_plan ADD CONSTRAINT ck_strategy_result CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND jsonb_typeof(result->'goals')='array' AND jsonb_array_length(result->'goals')<=30 AND jsonb_typeof(result->'pathIds')='array' AND jsonb_typeof(result->'resources')='object' AND jsonb_typeof(result->'milestones')='array' AND jsonb_typeof(result->'risks')='array' AND jsonb_typeof(result->'markets')='array' AND jsonb_typeof(result->'offerings')='array'));
CREATE FUNCTION yucer_gtm.guard_strategy_result() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,yucer_gtm AS $$
DECLARE choice TEXT; goal_row JSONB;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status<>'draft' AND NEW.result IS DISTINCT FROM OLD.result THEN RAISE EXCEPTION 'immutable_strategy'; END IF;
 IF TG_OP='UPDATE' AND OLD.result IS NOT NULL AND NEW.result IS NULL THEN RAISE EXCEPTION 'strategy_result_invalid'; END IF;
 IF NEW.result IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' OR NEW.result IS DISTINCT FROM OLD.result THEN
  choice:=NEW.result->>'valuePropositionId';
  IF choice IS NOT NULL AND NOT EXISTS(SELECT 1 FROM yucer_gtm.strategy_option WHERE workspace_id=NEW.workspace_id AND id::text=choice AND kind='value') THEN RAISE EXCEPTION 'strategy_option_unavailable'; END IF;
  FOR choice IN SELECT jsonb_array_elements_text(NEW.result->'pathIds') LOOP
   IF NOT EXISTS(SELECT 1 FROM yucer_gtm.strategy_option WHERE workspace_id=NEW.workspace_id AND id::text=choice AND kind='path') THEN RAISE EXCEPTION 'strategy_option_unavailable'; END IF;
  END LOOP;
 END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.result->'goals') z WHERE z->>'metric' IS NOT NULL AND COALESCE(z->>'target','')<>'')<>jsonb_array_length(NEW.expectations)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.expectations) e WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.result->'goals') g WHERE g->>'id'=e->>'id' AND g->>'metric'=e->>'metric' AND g->>'target'=e->>'amount' AND g->>'criterion'=e->>'criterion')) THEN RAISE EXCEPTION 'expectations_invalid'; END IF;
 IF TG_OP='UPDATE' AND OLD.status='draft' AND NEW.status IN ('approved','active') THEN
  IF NEW.strategy_type_id IS NULL OR COALESCE(btrim(NEW.owner_sub),'')='' OR COALESCE(btrim(NEW.objective),'')='' OR length(NEW.objective)>100 OR NEW.result->>'valuePropositionId' IS NULL OR jsonb_array_length(NEW.result->'goals')=0 OR NOT EXISTS(SELECT 1 FROM yucer_gtm.strategy_plan_market WHERE workspace_id=NEW.workspace_id AND plan_id=NEW.id) THEN RAISE EXCEPTION 'strategy_incomplete'; END IF;
  FOR goal_row IN SELECT * FROM jsonb_array_elements(NEW.result->'goals') LOOP
   IF COALESCE(btrim(goal_row->>'name'),'')='' OR COALESCE(goal_row->>'baseline','') !~ '^-?[0-9]+(\.[0-9]+)?$' OR COALESCE(goal_row->>'target','') !~ '^-?[0-9]+(\.[0-9]+)?$' OR COALESCE(btrim(goal_row->>'unit'),'')='' OR COALESCE(goal_row->>'dueOn','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'strategy_incomplete'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER strategy_result_guard BEFORE INSERT OR UPDATE ON yucer_gtm.strategy_plan FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_strategy_result();
REVOKE ALL ON FUNCTION yucer_gtm.guard_strategy_result() FROM PUBLIC;
CREATE OR REPLACE FUNCTION yucer_gtm.strategy_version_snapshot(ws UUID, pid UUID, legacy BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE SQL STABLE SET search_path = pg_catalog, yucer_gtm AS $$
SELECT jsonb_build_object(
  'schemaVersion',1,'legacy',legacy,'capturedAt',statement_timestamp(),
  'strategyTypeId',p.strategy_type_id,'strategyType',(SELECT jsonb_build_object('id',t.id,'code',t.code,'name',t.name,'description',t.description,'theme',t.theme,'enabled',t.enabled,'sortOrder',t.sort_order) FROM yucer_gtm.strategy_type t WHERE t.workspace_id=ws AND t.id=p.strategy_type_id),
  'result',p.result,'options',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'kind',o.kind,'code',o.code,'name',o.name,'enabled',o.enabled,'sortOrder',o.sort_order)) FROM yucer_gtm.strategy_option o WHERE o.workspace_id=ws AND (o.id::text=p.result->>'valuePropositionId' OR p.result->'pathIds' ? o.id::text)),'[]'::jsonb),'expectations',p.expectations,'name',p.name,'period',p.period,'objective',p.objective,'ownerSub',p.owner_sub,
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
  INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,lineage_id,base_plan_id,plan_no,name,period,objective,owner_sub,created_by_sub,strategy_type_id,expectations,result)
    VALUES(draft,ws,source.lineage_id,base,source.plan_no,source.name,source.period,source.objective,source.owner_sub,actor,source.strategy_type_id,source.expectations,source.result);
  INSERT INTO yucer_gtm.strategy_plan_solution SELECT workspace_id,draft,solution_id FROM yucer_gtm.strategy_plan_solution WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_product SELECT workspace_id,draft,product_id FROM yucer_gtm.strategy_plan_product WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market(workspace_id,plan_id,segment_id,intent,approach,market_name,criteria)
    SELECT workspace_id,draft,segment_id,intent,approach,market_name,criteria FROM yucer_gtm.strategy_plan_market WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market_solution SELECT workspace_id,draft,segment_id,solution_id FROM yucer_gtm.strategy_plan_market_solution WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market_product SELECT workspace_id,draft,segment_id,product_id FROM yucer_gtm.strategy_plan_market_product WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_event(workspace_id,lineage_id,plan_id,kind,actor_sub) VALUES(ws,source.lineage_id,draft,'revision',actor);
  RETURN draft;
END $$;


COMMIT;
