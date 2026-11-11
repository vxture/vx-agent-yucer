-- D2 aggregate releases: one atomic JSONB document per revision. Stable keys
-- inside the document retain the normalized model's target/resource identity.
-- No mutable child row can race with sealing. See ADR-038 implementation note.
BEGIN;
CREATE TABLE IF NOT EXISTS yucer_gtm.sales_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  lock_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, year),
  UNIQUE (workspace_id, id)
);
CREATE TABLE IF NOT EXISTS yucer_gtm.sales_plan_revision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  base_revision_id UUID,
  restores_revision_id UUID,
  state VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'sealed', 'abandoned')),
  edit_token INTEGER NOT NULL DEFAULT 1 CHECK (edit_token > 0),
  version_no INTEGER,
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_hash VARCHAR(64) CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  change_reason TEXT NOT NULL DEFAULT '',
  created_by_sub VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sealed_by_sub VARCHAR(128),
  sealed_at TIMESTAMPTZ,
  UNIQUE (workspace_id, plan_id, id),
  UNIQUE (workspace_id, plan_id, version_no),
  FOREIGN KEY (workspace_id, plan_id) REFERENCES yucer_gtm.sales_plan(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, plan_id, base_revision_id) REFERENCES yucer_gtm.sales_plan_revision(workspace_id, plan_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, plan_id, restores_revision_id) REFERENCES yucer_gtm.sales_plan_revision(workspace_id, plan_id, id) ON DELETE RESTRICT,
  CHECK ((state = 'sealed' AND version_no > 0 AND content_hash IS NOT NULL AND sealed_at IS NOT NULL AND sealed_by_sub IS NOT NULL) OR (state <> 'sealed' AND version_no IS NULL AND content_hash IS NULL AND sealed_at IS NULL AND sealed_by_sub IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_sales_plan_one_draft ON yucer_gtm.sales_plan_revision(workspace_id, plan_id) WHERE state = 'draft';
CREATE TABLE IF NOT EXISTS yucer_gtm.sales_plan_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  event_no INTEGER NOT NULL CHECK (event_no > 0),
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('draft', 'save', 'release', 'cancel', 'discard', 'lock', 'close')),
  revision_id UUID,
  related_event_no INTEGER,
  period_key VARCHAR(32),
  recorded_at TIMESTAMPTZ NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  request_key VARCHAR(160) NOT NULL,
  request_hash VARCHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  UNIQUE (workspace_id, plan_id, event_no),
  UNIQUE (workspace_id, plan_id, request_key),
  FOREIGN KEY (workspace_id, plan_id) REFERENCES yucer_gtm.sales_plan(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, plan_id, revision_id) REFERENCES yucer_gtm.sales_plan_revision(workspace_id, plan_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, plan_id, related_event_no) REFERENCES yucer_gtm.sales_plan_event(workspace_id, plan_id, event_no) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS yucer_gtm.sales_plan_legacy_target (
  workspace_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  legacy_target_id UUID NOT NULL,
  adopted_revision_id UUID NOT NULL,
  legacy_snapshot JSONB NOT NULL,
  PRIMARY KEY (workspace_id, legacy_target_id),
  FOREIGN KEY (workspace_id, plan_id, adopted_revision_id) REFERENCES yucer_gtm.sales_plan_revision(workspace_id, plan_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (legacy_target_id) REFERENCES yucer_gtm.sales_target(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS yucer_pipeline.forecast_target_basis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  forecast_snapshot_id UUID NOT NULL REFERENCES yucer_pipeline.forecast_snapshot(id) ON DELETE RESTRICT,
  metric VARCHAR(16) NOT NULL CHECK (metric IN ('revenue', 'pipeline', 'new_logo', 'margin')),
  source_kind VARCHAR(16) NOT NULL CHECK (source_kind IN ('sales_plan', 'legacy', 'none')),
  sales_plan_id UUID,
  revision_id UUID,
  line_key VARCHAR(160),
  legacy_target_ref UUID,
  target_snapshot JSONB NOT NULL,
  basis_resolved_at TIMESTAMPTZ NOT NULL,
  UNIQUE (workspace_id, forecast_snapshot_id, metric),
  FOREIGN KEY (workspace_id, sales_plan_id, revision_id) REFERENCES yucer_gtm.sales_plan_revision(workspace_id, plan_id, id) ON DELETE RESTRICT,
  CHECK ((source_kind = 'sales_plan' AND sales_plan_id IS NOT NULL AND revision_id IS NOT NULL AND line_key IS NOT NULL) OR (source_kind <> 'sales_plan' AND sales_plan_id IS NULL AND revision_id IS NULL AND line_key IS NULL))
);

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
        IF t->>'metric' <> 'pipeline' THEN
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
  IF publish AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'regions') z WHERE (z->>'included')::boolean) AND btrim(doc->>'allocationNote')='' THEN RAISE EXCEPTION 'allocation_note_required'; END IF;
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

CREATE OR REPLACE FUNCTION yucer_gtm.guard_sales_plan_revision()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, yucer_gtm AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_revision'; END IF;
  IF TG_OP='UPDATE' AND OLD.state<>'draft' THEN RAISE EXCEPTION 'immutable_revision'; END IF;
  IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event WHERE plan_id=NEW.plan_id AND workspace_id=NEW.workspace_id AND kind='close') THEN RAISE EXCEPTION 'plan_closed'; END IF;
  PERFORM 1 FROM yucer_gtm.sales_plan WHERE id=NEW.plan_id AND workspace_id=NEW.workspace_id AND year=(NEW.content->>'year')::int FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_plan'; END IF;
  IF TG_OP='INSERT' AND NEW.state<>'draft' THEN RAISE EXCEPTION 'draft_required'; END IF;
  IF TG_OP='UPDATE' AND OLD.state<>'draft' THEN RAISE EXCEPTION 'immutable_revision'; END IF;
  IF TG_OP='UPDATE' AND (NEW.workspace_id,NEW.plan_id,NEW.base_revision_id,NEW.restores_revision_id,NEW.created_at,NEW.created_by_sub) IS DISTINCT FROM (OLD.workspace_id,OLD.plan_id,OLD.base_revision_id,OLD.restores_revision_id,OLD.created_at,OLD.created_by_sub) THEN RAISE EXCEPTION 'immutable_identity'; END IF;
  IF TG_OP='UPDATE' AND NEW.state='sealed' AND current_user='yucer_svc' THEN RAISE EXCEPTION 'controlled_release_required'; END IF;
  PERFORM yucer_gtm.check_sales_plan_document(NEW.content, NEW.state='sealed');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_sales_plan_revision ON yucer_gtm.sales_plan_revision;
CREATE TRIGGER guard_sales_plan_revision BEFORE INSERT OR UPDATE OR DELETE ON yucer_gtm.sales_plan_revision FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_sales_plan_revision();

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
  RETURN jsonb_build_object('periods',periods,'targets',targets,'budgets',budgets,'contributions',contributions,'team',team,'regions',doc->'regions','actions',(SELECT COALESCE(jsonb_agg(z ORDER BY z::text),'[]') FROM jsonb_array_elements(doc->'actions') z WHERE z->>'due'>=p->>'start' AND z->>'due'<p->>'end'));
END $$;

CREATE OR REPLACE FUNCTION yucer_gtm.sales_plan_record_event(ws UUID, pid UUID, rid UUID, eno INTEGER, ekind TEXT, related INTEGER, pkey TEXT, stamp TIMESTAMPTZ, effective TIMESTAMPTZ, actor TEXT, why TEXT, req TEXT, reqhash TEXT, chash TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, yucer_gtm AS $$
DECLARE r yucer_gtm.sales_plan_revision; current_id UUID; old JSONB; period JSONB; section TEXT; p JSONB;
BEGIN
  PERFORM 1 FROM yucer_gtm.sales_plan WHERE workspace_id=ws AND id=pid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid AND kind='close') THEN RAISE EXCEPTION 'plan_closed'; END IF;
  IF eno <> COALESCE((SELECT max(event_no) FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid),0)+1 THEN RAISE EXCEPTION 'plan_conflict'; END IF;
  IF stamp < date_trunc('milliseconds',transaction_timestamp()) OR stamp > clock_timestamp()+interval '2 seconds' THEN RAISE EXCEPTION 'invalid_event_time'; END IF;
  SELECT e.revision_id INTO current_id FROM yucer_gtm.sales_plan_event e WHERE e.workspace_id=ws AND e.plan_id=pid AND e.kind='release' AND e.effective_at<=stamp AND NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event c WHERE c.workspace_id=ws AND c.plan_id=pid AND c.kind='cancel' AND c.related_event_no=e.event_no) ORDER BY e.effective_at DESC,e.event_no DESC LIMIT 1;
  IF ekind='release' THEN
    SELECT * INTO r FROM yucer_gtm.sales_plan_revision WHERE workspace_id=ws AND plan_id=pid AND id=rid FOR UPDATE;
    IF r.state IS DISTINCT FROM 'draft' OR r.base_revision_id IS DISTINCT FROM current_id THEN RAISE EXCEPTION 'plan_conflict'; END IF;
    IF effective<stamp OR effective>=make_timestamptz((r.content->>'year')::int+1,1,1,0,0,0,'UTC') THEN RAISE EXCEPTION 'retroactive_release'; END IF;
    IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event e WHERE e.workspace_id=ws AND e.plan_id=pid AND e.kind='release' AND e.effective_at>stamp AND NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event c WHERE c.workspace_id=ws AND c.plan_id=pid AND c.kind='cancel' AND c.related_event_no=e.event_no)) THEN RAISE EXCEPTION 'scheduled_exists'; END IF;
    IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision WHERE workspace_id=ws AND plan_id=pid AND state='sealed') AND btrim(why)='' THEN RAISE EXCEPTION 'change_reason_required'; END IF;
    PERFORM yucer_gtm.check_sales_plan_document(r.content,true);
    SELECT content INTO old FROM yucer_gtm.sales_plan_revision WHERE id=current_id;
    FOR p IN SELECT to_jsonb(e) FROM yucer_gtm.sales_plan_event e WHERE workspace_id=ws AND plan_id=pid AND kind='lock' LOOP
      IF yucer_gtm.sales_plan_closed_slice(old,p->>'period_key') IS DISTINCT FROM yucer_gtm.sales_plan_closed_slice(r.content,p->>'period_key') THEN RAISE EXCEPTION 'closed_period_changed'; END IF;
    END LOOP;
    UPDATE yucer_gtm.sales_plan_revision SET state='sealed',version_no=COALESCE((SELECT max(version_no) FROM yucer_gtm.sales_plan_revision WHERE workspace_id=ws AND plan_id=pid),0)+1,content_hash=chash,change_reason=why,sealed_at=stamp,sealed_by_sub=actor,edit_token=edit_token+1 WHERE id=rid;
  ELSIF ekind='cancel' THEN
    IF NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid AND event_no=related AND kind='release' AND revision_id=rid AND effective_at>stamp) OR EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid AND kind='cancel' AND related_event_no=related) OR btrim(why)='' THEN RAISE EXCEPTION 'no_scheduled_release'; END IF;
  ELSIF ekind='lock' THEN
    IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event e WHERE e.plan_id=pid AND e.workspace_id=ws AND e.kind='release' AND e.effective_at>stamp AND NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event c WHERE c.plan_id=pid AND c.workspace_id=ws AND c.kind='cancel' AND c.related_event_no=e.event_no)) THEN RAISE EXCEPTION 'scheduled_exists'; END IF;
    IF current_id IS NULL OR btrim(why)='' OR NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision v CROSS JOIN LATERAL jsonb_array_elements(v.content->'periods') z WHERE v.id=current_id AND z->>'key'=pkey AND z->>'parent' IS NOT NULL AND (z->>'end')::date<=stamp::date) OR EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event WHERE workspace_id=ws AND plan_id=pid AND kind='lock' AND period_key=pkey) THEN RAISE EXCEPTION 'period_not_finished'; END IF;
  ELSIF ekind='close' THEN
    IF btrim(why)='' OR EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event e WHERE e.plan_id=pid AND e.workspace_id=ws AND e.kind='release' AND e.effective_at>stamp AND NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_event c WHERE c.plan_id=pid AND c.workspace_id=ws AND c.kind='cancel' AND c.related_event_no=e.event_no)) OR EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision WHERE workspace_id=ws AND plan_id=pid AND state='draft') THEN RAISE EXCEPTION 'draft_exists'; END IF;
  ELSIF ekind IN ('draft','save') THEN
    IF NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision WHERE id=rid AND plan_id=pid AND workspace_id=ws AND state='draft') THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  ELSIF ekind='discard' THEN
    IF NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision WHERE id=rid AND plan_id=pid AND workspace_id=ws AND state='abandoned') THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  ELSE RAISE EXCEPTION 'invalid_event'; END IF;
  INSERT INTO yucer_gtm.sales_plan_event(workspace_id,plan_id,event_no,kind,revision_id,related_event_no,period_key,recorded_at,effective_at,actor_sub,reason,request_key,request_hash) VALUES (ws,pid,eno,ekind,rid,related,pkey,stamp,effective,actor,why,req,reqhash);
END $$;
REVOKE ALL ON FUNCTION yucer_gtm.sales_plan_record_event(UUID,UUID,UUID,INTEGER,TEXT,INTEGER,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_gtm.sales_plan_record_event(UUID,UUID,UUID,INTEGER,TEXT,INTEGER,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT) TO yucer_svc;
GRANT SELECT, INSERT ON yucer_gtm.sales_plan, yucer_gtm.sales_plan_revision TO yucer_svc;
GRANT SELECT ON yucer_gtm.sales_plan_event TO yucer_svc;
GRANT SELECT, INSERT ON yucer_gtm.sales_plan_legacy_target TO yucer_svc;
GRANT SELECT, INSERT ON yucer_pipeline.forecast_target_basis TO yucer_svc;
GRANT UPDATE (lock_version) ON yucer_gtm.sales_plan TO yucer_svc;
GRANT UPDATE (content, edit_token, state) ON yucer_gtm.sales_plan_revision TO yucer_svc;
REVOKE DELETE ON yucer_gtm.sales_plan, yucer_gtm.sales_plan_revision, yucer_gtm.sales_plan_event, yucer_gtm.sales_plan_legacy_target, yucer_pipeline.forecast_target_basis FROM yucer_svc;

CREATE OR REPLACE FUNCTION yucer_pipeline.guard_forecast_target_basis()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yucer_pipeline.forecast_snapshot WHERE id=NEW.forecast_snapshot_id AND workspace_id=NEW.workspace_id) THEN RAISE EXCEPTION 'basis_workspace_mismatch'; END IF;
  IF NEW.source_kind='sales_plan' AND NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision r CROSS JOIN LATERAL jsonb_array_elements(r.content->'targets') z WHERE r.id=NEW.revision_id AND r.workspace_id=NEW.workspace_id AND r.state='sealed' AND z->>'key'=NEW.line_key AND z->>'metric'=NEW.metric AND z->>'target' IS NOT DISTINCT FROM NEW.target_snapshot->>'target' AND z->>'currency' IS NOT DISTINCT FROM NEW.target_snapshot->>'currency' AND EXISTS (SELECT 1 FROM yucer_pipeline.forecast_snapshot f WHERE f.id=NEW.forecast_snapshot_id AND (z->>'period'=f.period OR (z->>'period'='Y'||f.period)) AND z->>'scope'=CASE WHEN f.scope_type='workspace' THEN 'workspace' WHEN f.scope_type='territory' THEN 'territory:'||f.territory_id::text ELSE 'unsupported' END AND (NEW.metric='new_logo' OR z->>'currency'=f.currency))) THEN RAISE EXCEPTION 'basis_target_mismatch'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_forecast_target_basis ON yucer_pipeline.forecast_target_basis;
CREATE TRIGGER guard_forecast_target_basis BEFORE INSERT ON yucer_pipeline.forecast_target_basis FOR EACH ROW EXECUTE FUNCTION yucer_pipeline.guard_forecast_target_basis();

REVOKE UPDATE ON yucer_gtm.sales_plan_event FROM yucer_svc;
REVOKE UPDATE ON yucer_gtm.sales_plan_legacy_target FROM yucer_svc;
REVOKE UPDATE ON yucer_pipeline.forecast_target_basis FROM yucer_svc;

CREATE OR REPLACE FUNCTION yucer_gtm.guard_sales_plan_legacy_target()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_target WHERE id=NEW.legacy_target_id AND workspace_id=NEW.workspace_id) OR NOT EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision WHERE id=NEW.adopted_revision_id AND workspace_id=NEW.workspace_id AND plan_id=NEW.plan_id AND state='sealed') THEN RAISE EXCEPTION 'legacy_workspace_mismatch'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_sales_plan_legacy_target ON yucer_gtm.sales_plan_legacy_target;
CREATE TRIGGER guard_sales_plan_legacy_target BEFORE INSERT ON yucer_gtm.sales_plan_legacy_target FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_sales_plan_legacy_target();
CREATE OR REPLACE FUNCTION yucer_gtm.guard_managed_sales_target()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE target_id UUID;
BEGIN
  IF TG_OP='INSERT' AND NEW.scope_type IN ('workspace','territory') THEN
    -- Serialize legacy creation with adoption/publication. A preflight check in
    -- application code alone leaves a concurrent insert able to create a
    -- second authority after the first release (including scheduled releases).
    PERFORM 1 FROM yucer_gtm.sales_plan p WHERE p.workspace_id=NEW.workspace_id AND (NEW.period IN (p.year::text,'Y'||p.year::text) OR NEW.period ~ ('^'||p.year::text||'Q[1-4]$') OR NEW.period ~ ('^'||p.year::text||'-(0[1-9]|1[0-2])$')) FOR UPDATE;
    IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_revision r CROSS JOIN LATERAL jsonb_array_elements(r.content->'periods') p WHERE r.workspace_id=NEW.workspace_id AND r.state='sealed' AND p->>'key'=CASE WHEN NEW.period ~ '^[0-9]{4}$' THEN 'Y'||NEW.period ELSE NEW.period END AND (NEW.scope_type='workspace' OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.content->'regions') z WHERE z->>'id'=NEW.territory_id::text))) THEN RAISE EXCEPTION 'managed_by_sales_plan'; END IF;
    RETURN NEW;
  END IF;
  target_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  IF EXISTS (SELECT 1 FROM yucer_gtm.sales_plan_legacy_target WHERE legacy_target_id=target_id) THEN RAISE EXCEPTION 'managed_by_sales_plan'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS guard_managed_sales_target ON yucer_gtm.sales_target;
CREATE TRIGGER guard_managed_sales_target BEFORE INSERT OR UPDATE OR DELETE ON yucer_gtm.sales_target FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_managed_sales_target();
COMMIT;
