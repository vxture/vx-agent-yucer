-- Configurable strategy intent; existing publications remain unclassified.
BEGIN;
CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_type (
  workspace_id UUID NOT NULL,
  code VARCHAR(64) NOT NULL CHECK (code ~ '^[a-z][a-z0-9-]{0,63}$'),
  name VARCHAR(64) NOT NULL CHECK (length(btrim(name)) > 0),
  description VARCHAR(240) NOT NULL DEFAULT '',
  theme VARCHAR(24) NOT NULL CHECK (theme IN ('focus','expand','innovate','partner','diversify')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,code)
);
GRANT SELECT, INSERT ON yucer_gtm.strategy_type TO yucer_svc;
REVOKE UPDATE, DELETE ON yucer_gtm.strategy_type FROM yucer_svc;
GRANT UPDATE (name, description, theme, enabled, sort_order, updated_at) ON yucer_gtm.strategy_type TO yucer_svc;
ALTER TABLE yucer_gtm.strategy_plan ADD COLUMN strategy_type_code VARCHAR(64);
ALTER TABLE yucer_gtm.strategy_plan ADD CONSTRAINT fk_strategy_type
  FOREIGN KEY (workspace_id,strategy_type_code) REFERENCES yucer_gtm.strategy_type(workspace_id,code) ON DELETE NO ACTION;
GRANT UPDATE (strategy_type_code) ON yucer_gtm.strategy_plan TO yucer_svc;

CREATE FUNCTION yucer_gtm.strategy_type_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, yucer_gtm AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.strategy_type_code IS NOT DISTINCT FROM OLD.strategy_type_code THEN RETURN NEW; END IF;
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'immutable_strategy'; END IF;
  END IF;
  -- A controlled revision may carry a disabled type; users can retain it or
  -- choose an enabled replacement. A new root cannot choose a disabled type.
  IF NEW.strategy_type_code IS NOT NULL AND NOT (TG_OP='INSERT' AND NEW.base_plan_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM yucer_gtm.strategy_type WHERE workspace_id=NEW.workspace_id AND code=NEW.strategy_type_code AND enabled FOR SHARE)
    THEN RAISE EXCEPTION 'strategy_type_unavailable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER strategy_type_guard BEFORE INSERT OR UPDATE ON yucer_gtm.strategy_plan
  FOR EACH ROW EXECUTE FUNCTION yucer_gtm.strategy_type_guard();
REVOKE ALL ON FUNCTION yucer_gtm.strategy_type_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION yucer_gtm.strategy_version_snapshot(ws UUID, pid UUID, legacy BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE SQL STABLE SET search_path = pg_catalog, yucer_gtm AS $$
SELECT jsonb_build_object(
  'schemaVersion',1,'legacy',legacy,'capturedAt',statement_timestamp(),
  'strategyTypeCode',p.strategy_type_code,'strategyType',(SELECT jsonb_build_object('code',t.code,'name',t.name,'description',t.description,'theme',t.theme,'enabled',t.enabled,'sortOrder',t.sort_order) FROM yucer_gtm.strategy_type t WHERE t.workspace_id=ws AND t.code=p.strategy_type_code),
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
  INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,lineage_id,base_plan_id,plan_no,name,period,objective,owner_sub,created_by_sub,strategy_type_code)
    VALUES(draft,ws,source.lineage_id,base,source.plan_no,source.name,source.period,source.objective,source.owner_sub,actor,source.strategy_type_code);
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
