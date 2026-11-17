-- Pin live strategy references to the workspace type's immutable UUID.
-- Published snapshots are frozen. The legacy code mirror supports old builds.
BEGIN;
ALTER TABLE yucer_gtm.strategy_type ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE yucer_gtm.strategy_type ADD CONSTRAINT uidx_strategy_type_ws_id UNIQUE (workspace_id, id);
ALTER TABLE yucer_gtm.strategy_plan ADD COLUMN strategy_type_id UUID;

-- This mechanical backfill must not invalidate a user's open edit token.
ALTER TABLE yucer_gtm.strategy_plan DISABLE TRIGGER strategy_plan_guard;
UPDATE yucer_gtm.strategy_plan p SET strategy_type_id = t.id
FROM yucer_gtm.strategy_type t
WHERE p.workspace_id = t.workspace_id AND p.strategy_type_code = t.code;
ALTER TABLE yucer_gtm.strategy_plan ENABLE TRIGGER strategy_plan_guard;
ALTER TABLE yucer_gtm.strategy_plan DROP CONSTRAINT fk_strategy_type;
ALTER TABLE yucer_gtm.strategy_plan ADD CONSTRAINT fk_strategy_type_id
  FOREIGN KEY (workspace_id, strategy_type_id) REFERENCES yucer_gtm.strategy_type(workspace_id, id);
GRANT UPDATE (strategy_type_id) ON yucer_gtm.strategy_plan TO yucer_svc;

CREATE OR REPLACE FUNCTION yucer_gtm.strategy_type_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE chosen yucer_gtm.strategy_type; by_id BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.strategy_type_id, NEW.strategy_type_code) IS NOT DISTINCT FROM (OLD.strategy_type_id, OLD.strategy_type_code) THEN RETURN NEW; END IF;
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'immutable_strategy'; END IF;
    by_id := NEW.strategy_type_id IS DISTINCT FROM OLD.strategy_type_id;
  ELSE
    by_id := NEW.strategy_type_id IS NOT NULL;
  END IF;
  IF by_id AND NEW.strategy_type_id IS NULL OR NOT by_id AND NEW.strategy_type_code IS NULL THEN
    NEW.strategy_type_id := NULL;
    NEW.strategy_type_code := NULL;
    RETURN NEW;
  END IF;
  IF by_id THEN
    SELECT * INTO chosen FROM yucer_gtm.strategy_type WHERE workspace_id = NEW.workspace_id AND id = NEW.strategy_type_id FOR SHARE;
  ELSE
    SELECT * INTO chosen FROM yucer_gtm.strategy_type WHERE workspace_id = NEW.workspace_id AND code = NEW.strategy_type_code FOR SHARE;
  END IF;
  IF NOT FOUND OR (NOT chosen.enabled AND NOT (TG_OP = 'INSERT' AND NEW.base_plan_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'strategy_type_unavailable';
  END IF;
  NEW.strategy_type_id := chosen.id;
  NEW.strategy_type_code := chosen.code;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION yucer_gtm.strategy_version_snapshot(ws UUID, pid UUID, legacy BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE SQL STABLE SET search_path = pg_catalog, yucer_gtm AS $$
SELECT jsonb_build_object(
  'schemaVersion',1,'legacy',legacy,'capturedAt',statement_timestamp(),
  'strategyTypeId',p.strategy_type_id,'strategyType',(SELECT jsonb_build_object('id',t.id,'code',t.code,'name',t.name,'description',t.description,'theme',t.theme,'enabled',t.enabled,'sortOrder',t.sort_order) FROM yucer_gtm.strategy_type t WHERE t.workspace_id=ws AND t.id=p.strategy_type_id),
  'name',p.name,'period',p.period,'objective',p.objective,'ownerSub',p.owner_sub,
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
  INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,lineage_id,base_plan_id,plan_no,name,period,objective,owner_sub,created_by_sub,strategy_type_id)
    VALUES(draft,ws,source.lineage_id,base,source.plan_no,source.name,source.period,source.objective,source.owner_sub,actor,source.strategy_type_id);
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
