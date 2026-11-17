-- Event numbers retain journal order; cancellation names a release by UUID.
BEGIN;
ALTER TABLE yucer_gtm.sales_plan_event ADD COLUMN related_event_id UUID;
ALTER TABLE yucer_gtm.sales_plan_event ADD CONSTRAINT uidx_sales_plan_event_scope_id UNIQUE (workspace_id, plan_id, id);
UPDATE yucer_gtm.sales_plan_event child SET related_event_id = parent.id
FROM yucer_gtm.sales_plan_event parent
WHERE child.workspace_id = parent.workspace_id AND child.plan_id = parent.plan_id AND child.related_event_no = parent.event_no;
ALTER TABLE yucer_gtm.sales_plan_event DROP CONSTRAINT sales_plan_event_workspace_id_plan_id_related_event_no_fkey;
ALTER TABLE yucer_gtm.sales_plan_event ADD CONSTRAINT fk_sales_plan_related_event_id
  FOREIGN KEY (workspace_id, plan_id, related_event_id) REFERENCES yucer_gtm.sales_plan_event(workspace_id, plan_id, id) ON DELETE RESTRICT;
CREATE INDEX idx_sales_plan_related_event_id ON yucer_gtm.sales_plan_event(workspace_id, plan_id, related_event_id);

CREATE OR REPLACE FUNCTION yucer_gtm.sales_plan_record_event_uuid(ws UUID, pid UUID, rid UUID, eno INTEGER, ekind TEXT, related UUID, event_id UUID, pkey TEXT, stamp TIMESTAMPTZ, effective TIMESTAMPTZ, actor TEXT, why TEXT, req TEXT, reqhash TEXT, chash TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE r yucer_gtm.sales_plan_revision; current_id UUID; old JSONB; period JSONB; section TEXT; p JSONB;
BEGIN
  PERFORM 1 FROM yucer_gtm.sales_plan WHERE workspace_id=ws AND id=pid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid AND kind='close') THEN RAISE EXCEPTION 'plan_closed'; END IF;
  IF eno <> COALESCE((SELECT max(event_no) FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid),0)+1 THEN RAISE EXCEPTION 'plan_conflict'; END IF;
  IF stamp < date_trunc('milliseconds',transaction_timestamp()) OR stamp > clock_timestamp()+interval '2 seconds' THEN RAISE EXCEPTION 'invalid_event_time'; END IF;
  SELECT e.revision_id INTO current_id FROM yucer_gtm.sales_plan_event e WHERE e.workspace_id=ws AND e.plan_id=pid AND e.kind='release' AND e.effective_at<=stamp AND NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event c WHERE c.workspace_id=ws AND c.plan_id=pid AND c.kind='cancel' AND c.related_event_id=e.id) ORDER BY e.effective_at DESC,e.event_no DESC LIMIT 1;
  IF ekind='release' THEN
    SELECT * INTO r FROM yucer_gtm.sales_plan_revision WHERE workspace_id=ws AND plan_id=pid AND id=rid FOR UPDATE;
    IF r.state IS DISTINCT FROM 'draft' OR r.base_revision_id IS DISTINCT FROM current_id THEN RAISE EXCEPTION 'plan_conflict'; END IF;
    IF effective<stamp OR effective>=make_timestamptz((r.content->>'year')::int+1,1,1,0,0,0,'UTC') THEN RAISE EXCEPTION 'retroactive_release'; END IF;
    IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event e WHERE e.workspace_id=ws AND e.plan_id=pid AND e.kind='release' AND e.effective_at>stamp AND NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event c WHERE c.workspace_id=ws AND c.plan_id=pid AND c.kind='cancel' AND c.related_event_id=e.id)) THEN RAISE EXCEPTION 'scheduled_exists'; END IF;
    IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision WHERE workspace_id=ws AND plan_id=pid AND state='sealed') AND btrim(why)='' THEN RAISE EXCEPTION 'change_reason_required'; END IF;
    PERFORM yucer_gtm.check_sales_plan_document(r.content,true);
    SELECT content INTO old FROM yucer_gtm.sales_plan_revision WHERE id=current_id;
    FOR p IN SELECT to_jsonb(e) FROM yucer_gtm.sales_plan_event e WHERE workspace_id=ws AND plan_id=pid AND kind='lock' LOOP
      IF yucer_gtm.sales_plan_closed_slice(old,p->>'period_key') IS DISTINCT FROM yucer_gtm.sales_plan_closed_slice(r.content,p->>'period_key') THEN RAISE EXCEPTION 'closed_period_changed'; END IF;
    END LOOP;
    UPDATE yucer_gtm.sales_plan_revision SET state='sealed',version_no=COALESCE((SELECT max(version_no) FROM yucer_gtm.sales_plan_revision WHERE workspace_id=ws AND plan_id=pid),0)+1,content_hash=chash,change_reason=why,sealed_at=stamp,sealed_by_sub=actor,edit_token=edit_token+1 WHERE id=rid;
  ELSIF ekind='cancel' THEN
    IF NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid AND id=related AND kind='release' AND revision_id=rid AND effective_at>stamp) OR EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid AND kind='cancel' AND related_event_id=related) OR btrim(why)='' THEN RAISE EXCEPTION 'no_scheduled_release'; END IF;
  ELSIF ekind='lock' THEN
    IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event e WHERE e.plan_id=pid AND e.workspace_id=ws AND e.kind='release' AND e.effective_at>stamp AND NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event c WHERE c.plan_id=pid AND c.workspace_id=ws AND c.kind='cancel' AND c.related_event_id=e.id)) THEN RAISE EXCEPTION 'scheduled_exists'; END IF;
    IF current_id IS NULL OR btrim(why)='' OR NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision v CROSS JOIN LATERAL jsonb_array_elements(v.content->'periods') z WHERE v.id=current_id AND z->>'key'=pkey AND z->>'parent' IS NOT NULL AND (z->>'end')::date<=stamp::date) OR EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid AND kind='lock' AND period_key=pkey) THEN RAISE EXCEPTION 'period_not_finished'; END IF;
  ELSIF ekind='close' THEN
    IF btrim(why)='' OR EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event e WHERE e.plan_id=pid AND e.workspace_id=ws AND e.kind='release' AND e.effective_at>stamp AND NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event c WHERE c.plan_id=pid AND c.workspace_id=ws AND c.kind='cancel' AND c.related_event_id=e.id)) OR EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision WHERE workspace_id=ws AND plan_id=pid AND state='draft') THEN RAISE EXCEPTION 'draft_exists'; END IF;
  ELSIF ekind IN ('draft','save') THEN
    IF NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision WHERE id=rid AND plan_id=pid AND workspace_id=ws AND state='draft') THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  ELSIF ekind='discard' THEN
    IF NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision WHERE id=rid AND plan_id=pid AND workspace_id=ws AND state='abandoned') THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  ELSE RAISE EXCEPTION 'invalid_event'; END IF;
  INSERT INTO yucer_gtm.sales_plan_event(id,workspace_id,plan_id,event_no,kind,revision_id,related_event_id,related_event_no,period_key,recorded_at,effective_at,actor_sub,reason,request_key,request_hash) VALUES (event_id,ws,pid,eno,ekind,rid,related,(SELECT event_no FROM yucer_gtm.sales_plan_event WHERE id=related),pkey,stamp,effective,actor,why,req,reqhash);
END $$;
REVOKE ALL ON FUNCTION yucer_gtm.sales_plan_record_event_uuid(UUID,UUID,UUID,INTEGER,TEXT,UUID,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_gtm.sales_plan_record_event_uuid(UUID,UUID,UUID,INTEGER,TEXT,UUID,UUID,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT) TO yucer_svc;

-- Previous builds still speak event number; resolve at the compatibility boundary.
CREATE OR REPLACE FUNCTION yucer_gtm.sales_plan_record_event(ws UUID, pid UUID, rid UUID, eno INTEGER, ekind TEXT, related INTEGER, pkey TEXT, stamp TIMESTAMPTZ, effective TIMESTAMPTZ, actor TEXT, why TEXT, req TEXT, reqhash TEXT, chash TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE related_id UUID;
BEGIN
  IF related IS NOT NULL THEN
    SELECT id INTO related_id FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid AND event_no=related;
    IF NOT FOUND THEN RAISE EXCEPTION 'no_scheduled_release'; END IF;
  END IF;
  PERFORM yucer_gtm.sales_plan_record_event_uuid(ws,pid,rid,eno,ekind,related_id,gen_random_uuid(),pkey,stamp,effective,actor,why,req,reqhash,chash);
END $$;
COMMIT;
