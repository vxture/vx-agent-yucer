-- D1 revisions retain distinct plan ids: downstream attribution never moves.
-- plan_no identifies a lineage; a plan id identifies one exact draft/version.
BEGIN;
ALTER TABLE yucer_gtm.strategy_plan
  ADD COLUMN lineage_id UUID,
  ADD COLUMN base_plan_id UUID,
  ADD COLUMN version_no INTEGER CHECK (version_no > 0),
  ADD COLUMN edit_token INTEGER NOT NULL DEFAULT 1 CHECK (edit_token > 0),
  ADD COLUMN change_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN published_by_sub VARCHAR(128),
  ADD COLUMN published_snapshot JSONB;
UPDATE yucer_gtm.strategy_plan SET lineage_id = id;
ALTER TABLE yucer_gtm.strategy_plan ALTER COLUMN lineage_id SET NOT NULL;
ALTER TABLE yucer_gtm.strategy_plan DROP CONSTRAINT uidx_strategy_plan_ws_no;
CREATE UNIQUE INDEX uidx_strategy_plan_ws_no ON yucer_gtm.strategy_plan(workspace_id, plan_no) WHERE base_plan_id IS NULL;
CREATE UNIQUE INDEX uidx_strategy_plan_lineage_id ON yucer_gtm.strategy_plan(workspace_id, lineage_id, id);
CREATE UNIQUE INDEX uidx_strategy_plan_version ON yucer_gtm.strategy_plan(workspace_id, lineage_id, version_no);
CREATE UNIQUE INDEX uidx_strategy_one_draft ON yucer_gtm.strategy_plan(workspace_id, lineage_id) WHERE status = 'draft';
ALTER TABLE yucer_gtm.strategy_plan
  ADD CONSTRAINT fk_strategy_lineage FOREIGN KEY (workspace_id, lineage_id) REFERENCES yucer_gtm.strategy_plan(workspace_id, id) ON DELETE NO ACTION,
  ADD CONSTRAINT fk_strategy_base FOREIGN KEY (workspace_id, lineage_id, base_plan_id) REFERENCES yucer_gtm.strategy_plan(workspace_id, lineage_id, id) ON DELETE NO ACTION;

CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_plan_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  lineage_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('revision','publish','discard')),
  actor_sub VARCHAR(128) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL DEFAULT '',
  UNIQUE (workspace_id, plan_id, kind),
  FOREIGN KEY (workspace_id, lineage_id, plan_id) REFERENCES yucer_gtm.strategy_plan(workspace_id, lineage_id, id) ON DELETE NO ACTION
);

CREATE FUNCTION yucer_gtm.strategy_version_snapshot(ws UUID, pid UUID, legacy BOOLEAN DEFAULT false)
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
  'targetMarkets',COALESCE((SELECT jsonb_agg(jsonb_build_object('segmentId',m.segment_id,'marketName',m.market_name,'criteria',m.criteria,'intent',m.intent,'approach',m.approach,
    'solutionIds',COALESCE((SELECT jsonb_agg(solution_id::text ORDER BY solution_id) FROM yucer_gtm.strategy_plan_market_solution WHERE workspace_id=ws AND plan_id=pid AND segment_id=m.segment_id),'[]')) ORDER BY m.segment_id)
    FROM yucer_gtm.strategy_plan_market m WHERE m.workspace_id=ws AND m.plan_id=pid),'[]'))
FROM yucer_gtm.strategy_plan p WHERE p.workspace_id=ws AND p.id=pid
$$;
-- Existing publications get a clearly labelled adoption snapshot of today's
-- stored content. It is not represented as a recovered historical document.
UPDATE yucer_gtm.strategy_plan p SET version_no=1,
  published_snapshot=yucer_gtm.strategy_version_snapshot(workspace_id,id,true)
WHERE status IN ('approved','active','closed') OR approved_at IS NOT NULL;
ALTER TABLE yucer_gtm.strategy_plan ADD CONSTRAINT chk_strategy_publication
  CHECK ((version_no IS NULL AND published_snapshot IS NULL AND published_by_sub IS NULL)
    OR (version_no IS NOT NULL AND status <> 'draft' AND published_snapshot IS NOT NULL AND jsonb_typeof(published_snapshot)='object'));

CREATE FUNCTION yucer_gtm.strategy_plan_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE root yucer_gtm.strategy_plan;
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.lineage_id := COALESCE(NEW.lineage_id, NEW.id);
    IF NEW.lineage_id=NEW.id THEN
      IF NEW.base_plan_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_strategy_lineage'; END IF;
    ELSE
      SELECT * INTO root FROM yucer_gtm.strategy_plan WHERE id=NEW.lineage_id AND workspace_id=NEW.workspace_id;
      IF NOT FOUND OR root.lineage_id<>root.id OR root.plan_no<>NEW.plan_no OR NEW.base_plan_id IS NULL THEN RAISE EXCEPTION 'invalid_strategy_lineage'; END IF;
    END IF;
    IF current_user='yucer_svc' AND (NEW.base_plan_id IS NOT NULL OR NEW.status<>'draft' OR NEW.version_no IS NOT NULL OR NEW.published_snapshot IS NOT NULL OR NEW.edit_token<>1) THEN RAISE EXCEPTION 'controlled_release_required'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF current_user='yucer_svc' THEN RAISE EXCEPTION 'immutable_strategy'; END IF;
    RETURN OLD;
  END IF;
  IF (NEW.id,NEW.workspace_id,NEW.lineage_id,NEW.base_plan_id,NEW.plan_no,NEW.created_by_sub,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.workspace_id,OLD.lineage_id,OLD.base_plan_id,OLD.plan_no,OLD.created_by_sub,OLD.created_at) THEN RAISE EXCEPTION 'immutable_identity'; END IF;
  IF OLD.status<>'draft' AND (NEW.name,NEW.period,NEW.objective,NEW.owner_sub,NEW.change_reason,NEW.version_no,NEW.published_by_sub,NEW.published_snapshot,NEW.approved_at)
    IS DISTINCT FROM (OLD.name,OLD.period,OLD.objective,OLD.owner_sub,OLD.change_reason,OLD.version_no,OLD.published_by_sub,OLD.published_snapshot,OLD.approved_at) THEN RAISE EXCEPTION 'immutable_strategy'; END IF;
  IF OLD.status<>'draft' AND NEW.status='draft' THEN RAISE EXCEPTION 'immutable_strategy'; END IF;
  IF current_user='yucer_svc' AND OLD.status='draft' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'controlled_release_required'; END IF;
  NEW.edit_token := OLD.edit_token+1;
  RETURN NEW;
END $$;
CREATE TRIGGER strategy_plan_guard BEFORE INSERT OR UPDATE OR DELETE ON yucer_gtm.strategy_plan FOR EACH ROW EXECUTE FUNCTION yucer_gtm.strategy_plan_guard();

CREATE FUNCTION yucer_gtm.strategy_selection_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE row_ws UUID; row_plan UUID; parent yucer_gtm.strategy_plan;
BEGIN
  row_ws := CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
  row_plan := CASE WHEN TG_OP='DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
  SELECT * INTO parent FROM yucer_gtm.strategy_plan WHERE workspace_id=row_ws AND id=row_plan FOR UPDATE;
  -- A maintenance DELETE of the parent may already have removed it.
  IF FOUND AND parent.status<>'draft' THEN RAISE EXCEPTION 'immutable_strategy'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER strategy_selection_guard BEFORE INSERT OR UPDATE OR DELETE ON yucer_gtm.strategy_plan_solution FOR EACH ROW EXECUTE FUNCTION yucer_gtm.strategy_selection_guard();
CREATE TRIGGER strategy_selection_guard BEFORE INSERT OR UPDATE OR DELETE ON yucer_gtm.strategy_plan_market FOR EACH ROW EXECUTE FUNCTION yucer_gtm.strategy_selection_guard();
CREATE TRIGGER strategy_selection_guard BEFORE INSERT OR UPDATE OR DELETE ON yucer_gtm.strategy_plan_market_solution FOR EACH ROW EXECUTE FUNCTION yucer_gtm.strategy_selection_guard();

CREATE FUNCTION yucer_gtm.revise_strategy_plan(ws UUID, base UUID, actor TEXT)
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
  INSERT INTO yucer_gtm.strategy_plan_market(workspace_id,plan_id,segment_id,intent,approach,market_name,criteria)
    SELECT workspace_id,draft,segment_id,intent,approach,market_name,criteria FROM yucer_gtm.strategy_plan_market WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_market_solution SELECT workspace_id,draft,segment_id,solution_id FROM yucer_gtm.strategy_plan_market_solution WHERE workspace_id=ws AND plan_id=base;
  INSERT INTO yucer_gtm.strategy_plan_event(workspace_id,lineage_id,plan_id,kind,actor_sub) VALUES(ws,source.lineage_id,draft,'revision',actor);
  RETURN draft;
END $$;

CREATE FUNCTION yucer_gtm.publish_strategy_plan(ws UUID, pid UUID, token INTEGER, actor TEXT, stamp TIMESTAMPTZ)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE draft yucer_gtm.strategy_plan; latest yucer_gtm.strategy_plan; snapshot JSONB; next_status TEXT;
BEGIN
  IF COALESCE(btrim(actor),'')='' OR length(actor)>128 OR stamp IS NULL OR token IS NULL OR token<1 THEN RAISE EXCEPTION 'invalid_publication'; END IF;
  SELECT * INTO draft FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND id=pid;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy_not_found'; END IF;
  PERFORM 1 FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND id=draft.lineage_id FOR UPDATE;
  SELECT * INTO draft FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND id=pid FOR UPDATE;
  IF draft.version_no IS NOT NULL THEN RETURN pid; END IF;
  IF draft.status<>'draft' THEN RAISE EXCEPTION 'draft_required'; END IF;
  IF draft.edit_token<>token THEN RAISE EXCEPTION 'strategy_draft_conflict'; END IF;
  IF btrim(draft.name)='' OR btrim(draft.period)='' THEN RAISE EXCEPTION 'invalid_publication'; END IF;
  IF draft.base_plan_id IS NOT NULL AND (btrim(draft.change_reason)='' OR length(draft.change_reason)>4000) THEN RAISE EXCEPTION 'strategy_reason_required'; END IF;
  SELECT * INTO latest FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND lineage_id=draft.lineage_id AND version_no IS NOT NULL ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF draft.base_plan_id IS DISTINCT FROM latest.id OR (latest.id IS NOT NULL AND latest.status NOT IN ('approved','active')) THEN RAISE EXCEPTION 'strategy_base_conflict'; END IF;
  snapshot := yucer_gtm.strategy_version_snapshot(ws,pid,false);
  next_status := CASE WHEN latest.status='active' THEN 'active' ELSE 'approved' END;
  IF latest.id IS NOT NULL THEN UPDATE yucer_gtm.strategy_plan SET status='closed',updated_at=stamp WHERE workspace_id=ws AND id=latest.id; END IF;
  UPDATE yucer_gtm.strategy_plan SET status=next_status,version_no=COALESCE(latest.version_no,0)+1,
    approved_at=stamp,published_by_sub=actor,published_snapshot=snapshot,updated_at=stamp WHERE workspace_id=ws AND id=pid;
  INSERT INTO yucer_gtm.strategy_plan_event(workspace_id,lineage_id,plan_id,kind,actor_sub,recorded_at,reason)
    VALUES(ws,draft.lineage_id,pid,'publish',actor,stamp,draft.change_reason);
  RETURN pid;
END $$;

CREATE FUNCTION yucer_gtm.discard_strategy_draft(ws UUID, pid UUID, token INTEGER, actor TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE draft yucer_gtm.strategy_plan;
BEGIN
  IF COALESCE(btrim(actor),'')='' OR length(actor)>128 OR token IS NULL OR token<1 THEN RAISE EXCEPTION 'invalid_publication'; END IF;
  SELECT * INTO draft FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND id=pid;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy_not_found'; END IF;
  PERFORM 1 FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND id=draft.lineage_id FOR UPDATE;
  SELECT * INTO draft FROM yucer_gtm.strategy_plan WHERE workspace_id=ws AND id=pid FOR UPDATE;
  IF draft.status='archived' AND draft.version_no IS NULL THEN RETURN pid; END IF;
  IF draft.status<>'draft' THEN RAISE EXCEPTION 'draft_required'; END IF;
  IF draft.edit_token<>token THEN RAISE EXCEPTION 'strategy_draft_conflict'; END IF;
  UPDATE yucer_gtm.strategy_plan SET status='archived',updated_at=statement_timestamp() WHERE workspace_id=ws AND id=pid;
  INSERT INTO yucer_gtm.strategy_plan_event(workspace_id,lineage_id,plan_id,kind,actor_sub,reason) VALUES(ws,draft.lineage_id,pid,'discard',actor,draft.change_reason);
  RETURN pid;
END $$;
REVOKE ALL ON FUNCTION yucer_gtm.revise_strategy_plan(UUID,UUID,TEXT), yucer_gtm.publish_strategy_plan(UUID,UUID,INTEGER,TEXT,TIMESTAMPTZ), yucer_gtm.discard_strategy_draft(UUID,UUID,INTEGER,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_gtm.revise_strategy_plan(UUID,UUID,TEXT), yucer_gtm.publish_strategy_plan(UUID,UUID,INTEGER,TEXT,TIMESTAMPTZ), yucer_gtm.discard_strategy_draft(UUID,UUID,INTEGER,TEXT) TO yucer_svc;
REVOKE ALL ON FUNCTION yucer_gtm.strategy_version_snapshot(UUID,UUID,BOOLEAN) FROM PUBLIC;
GRANT SELECT ON yucer_gtm.strategy_plan_event TO yucer_svc;
REVOKE UPDATE, DELETE, INSERT ON yucer_gtm.strategy_plan_event FROM yucer_svc;
REVOKE DELETE ON yucer_gtm.strategy_plan FROM yucer_svc;
GRANT UPDATE (change_reason) ON yucer_gtm.strategy_plan TO yucer_svc;
COMMIT;
