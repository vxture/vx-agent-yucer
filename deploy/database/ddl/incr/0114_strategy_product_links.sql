-- Product and solution references remain separate, workspace-scoped identities.
BEGIN;
CREATE UNIQUE INDEX uidx_product_ws_id ON yucer_catalog.product (workspace_id, id);

CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_plan_product (
  workspace_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  product_id UUID NOT NULL,
  PRIMARY KEY (workspace_id, plan_id, product_id),
  CONSTRAINT fk_strategy_product_plan FOREIGN KEY (workspace_id, plan_id)
    REFERENCES yucer_gtm.strategy_plan (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_strategy_product_catalog FOREIGN KEY (workspace_id, product_id)
    REFERENCES yucer_catalog.product (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_strategy_product_catalog ON yucer_gtm.strategy_plan_product (workspace_id, product_id);
GRANT SELECT, INSERT, DELETE ON yucer_gtm.strategy_plan_product TO yucer_svc;
REVOKE UPDATE ON yucer_gtm.strategy_plan_product FROM yucer_svc;

CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_plan_market_product (
  workspace_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  segment_id UUID NOT NULL,
  product_id UUID NOT NULL,
  PRIMARY KEY (workspace_id, plan_id, segment_id, product_id),
  CONSTRAINT fk_market_product_target FOREIGN KEY (workspace_id, plan_id, segment_id)
    REFERENCES yucer_gtm.strategy_plan_market (workspace_id, plan_id, segment_id) ON DELETE CASCADE,
  CONSTRAINT fk_market_product_catalog FOREIGN KEY (workspace_id, product_id)
    REFERENCES yucer_catalog.product (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_market_product_catalog ON yucer_gtm.strategy_plan_market_product (workspace_id, product_id);
GRANT SELECT, INSERT, DELETE ON yucer_gtm.strategy_plan_market_product TO yucer_svc;
REVOKE UPDATE ON yucer_gtm.strategy_plan_market_product FROM yucer_svc;

CREATE TABLE IF NOT EXISTS yucer_gtm.market_segment_product (
  workspace_id UUID NOT NULL,
  segment_id UUID NOT NULL,
  product_id UUID NOT NULL,
  PRIMARY KEY (workspace_id, segment_id, product_id),
  CONSTRAINT fk_segment_product_market FOREIGN KEY (workspace_id, segment_id)
    REFERENCES yucer_gtm.market_segment (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_segment_product_catalog FOREIGN KEY (workspace_id, product_id)
    REFERENCES yucer_catalog.product (workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_segment_product_catalog ON yucer_gtm.market_segment_product (workspace_id, product_id);
GRANT SELECT, INSERT, DELETE ON yucer_gtm.market_segment_product TO yucer_svc;
REVOKE UPDATE ON yucer_gtm.market_segment_product FROM yucer_svc;

CREATE OR REPLACE FUNCTION yucer_gtm.strategy_version_snapshot(ws UUID, pid UUID, legacy BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE SQL STABLE SET search_path = pg_catalog, yucer_gtm AS $$
SELECT jsonb_build_object(
  'schemaVersion',1,'legacy',legacy,'capturedAt',statement_timestamp(),
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
  INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,lineage_id,base_plan_id,plan_no,name,period,objective,owner_sub,created_by_sub)
    VALUES(draft,ws,source.lineage_id,base,source.plan_no,source.name,source.period,source.objective,source.owner_sub,actor);
  INSERT INTO yucer_gtm.strategy_plan_solution SELECT workspace_id,draft,solution_id FROM yucer_gtm.strategy_plan_solution WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_product SELECT workspace_id,draft,product_id FROM yucer_gtm.strategy_plan_product WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market(workspace_id,plan_id,segment_id,intent,approach,market_name,criteria)
    SELECT workspace_id,draft,segment_id,intent,approach,market_name,criteria FROM yucer_gtm.strategy_plan_market WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market_solution SELECT workspace_id,draft,segment_id,solution_id FROM yucer_gtm.strategy_plan_market_solution WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market_product SELECT workspace_id,draft,segment_id,product_id FROM yucer_gtm.strategy_plan_market_product WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_event(workspace_id,lineage_id,plan_id,kind,actor_sub) VALUES(ws,source.lineage_id,draft,'revision',actor);
  RETURN draft;
END $$;

CREATE TRIGGER strategy_selection_guard BEFORE INSERT OR UPDATE OR DELETE ON yucer_gtm.strategy_plan_product FOR EACH ROW EXECUTE FUNCTION yucer_gtm.strategy_selection_guard();

CREATE TRIGGER strategy_selection_guard BEFORE INSERT OR UPDATE OR DELETE ON yucer_gtm.strategy_plan_market_product FOR EACH ROW EXECUTE FUNCTION yucer_gtm.strategy_selection_guard();

COMMIT;
