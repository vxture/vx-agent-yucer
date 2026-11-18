-- Append-only evidence for non-financial strategic commitments.
BEGIN;
CREATE TABLE IF NOT EXISTS yucer_gtm.strategic_result (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
 plan_id UUID NOT NULL, revision_id UUID NOT NULL, acceptance_key UUID NOT NULL,
 lineage_id UUID NOT NULL, objective_id UUID NOT NULL, allocation_key UUID NOT NULL, region_id UUID NOT NULL,
 achieved_on DATE NOT NULL, evidence_url TEXT NOT NULL CHECK (length(evidence_url)<=2000 AND evidence_url ~ '^https?://[^ /]+'),
 note TEXT NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 2000), actor_sub VARCHAR(128) NOT NULL CHECK(length(btrim(actor_sub))>0),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(), voids_id UUID,
 UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,plan_id,revision_id) REFERENCES yucer_gtm.sales_plan_revision(workspace_id,plan_id,id),
 FOREIGN KEY(workspace_id,lineage_id) REFERENCES yucer_gtm.strategy_plan(workspace_id,id),
 FOREIGN KEY(workspace_id,voids_id) REFERENCES yucer_gtm.strategic_result(workspace_id,id)
);
CREATE UNIQUE INDEX uidx_strategic_result_evidence ON yucer_gtm.strategic_result(workspace_id,lineage_id,objective_id,evidence_url) WHERE voids_id IS NULL;
CREATE UNIQUE INDEX uidx_strategic_result_void ON yucer_gtm.strategic_result(workspace_id,voids_id) WHERE voids_id IS NOT NULL;
GRANT SELECT,INSERT ON yucer_gtm.strategic_result TO yucer_svc;
REVOKE UPDATE,DELETE ON yucer_gtm.strategic_result FROM yucer_svc;
CREATE FUNCTION yucer_gtm.guard_strategic_result() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,yucer_gtm AS $$
DECLARE r yucer_gtm.sales_plan_revision; x JSONB; a JSONB; p JSONB; original_result yucer_gtm.strategic_result;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'immutable_strategic_result'; END IF;
 SELECT * INTO r FROM yucer_gtm.sales_plan_revision WHERE workspace_id=NEW.workspace_id AND plan_id=NEW.plan_id AND id=NEW.revision_id;
 IF r.state IS DISTINCT FROM 'sealed' THEN RAISE EXCEPTION 'strategy_result_invalid'; END IF;
 SELECT value INTO x FROM jsonb_array_elements(r.content->'strategyAcceptances') WHERE value->>'key'=NEW.acceptance_key::text;
 SELECT value INTO a FROM jsonb_array_elements(x->'allocations') WHERE value->>'key'=NEW.allocation_key::text;
 SELECT value INTO p FROM jsonb_array_elements(r.content->'periods') WHERE value->>'key'=a->>'period';
 IF x IS NULL OR a IS NULL OR p IS NULL OR x->'expectation'->>'metric' NOT IN ('channels','reference_cases') OR x->>'lineageId' IS DISTINCT FROM NEW.lineage_id::text OR x->'expectation'->>'id' IS DISTINCT FROM NEW.objective_id::text OR a->>'regionId' IS DISTINCT FROM NEW.region_id::text OR NEW.achieved_on<(p->>'start')::date OR NEW.achieved_on>=(p->>'end')::date OR NEW.achieved_on>CURRENT_DATE OR NOT NEW.achieved_on <@ yucer_gtm.strategy_execution_window(x->>'period') THEN RAISE EXCEPTION 'strategy_result_invalid'; END IF;
 IF NEW.voids_id IS NOT NULL THEN
  SELECT * INTO original_result FROM yucer_gtm.strategic_result WHERE workspace_id=NEW.workspace_id AND id=NEW.voids_id;
  IF original_result.id IS NULL OR original_result.voids_id IS NOT NULL OR (original_result.lineage_id,original_result.objective_id,original_result.allocation_key) IS DISTINCT FROM (NEW.lineage_id,NEW.objective_id,NEW.allocation_key) THEN RAISE EXCEPTION 'strategy_result_conflict'; END IF;
 END IF;
 NEW.recorded_at:=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER strategic_result_guard BEFORE INSERT OR UPDATE OR DELETE ON yucer_gtm.strategic_result FOR EACH ROW EXECUTE FUNCTION yucer_gtm.guard_strategic_result();
COMMIT;
