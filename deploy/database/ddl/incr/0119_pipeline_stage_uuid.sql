-- Keep stage codes as workflow vocabulary while pinning all record links to UUIDs.
BEGIN;
ALTER TABLE yucer_pipeline.stage_definition ADD CONSTRAINT uidx_stage_definition_ws_id UNIQUE (workspace_id, id);

CREATE FUNCTION yucer_pipeline.resolve_stage_reference(ws UUID, stage_key TEXT, constraint_key TEXT)
RETURNS UUID LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE result UUID;
BEGIN
  IF stage_key IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO result FROM yucer_pipeline.stage_definition WHERE workspace_id = ws AND stage_code = stage_key;
  IF result IS NULL THEN
    RAISE EXCEPTION 'unknown stage (%) for constraint %', stage_key, constraint_key
      USING ERRCODE = '23503', CONSTRAINT = constraint_key;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION yucer_pipeline.resolve_stage_reference(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION yucer_pipeline.resolve_stage_reference(UUID, TEXT, TEXT) TO yucer_svc;

ALTER TABLE yucer_pipeline.opportunity ADD COLUMN stage_id UUID;
UPDATE yucer_pipeline.opportunity r SET stage_id = d.id
FROM yucer_pipeline.stage_definition d WHERE d.workspace_id = r.workspace_id AND d.stage_code = r.stage;
ALTER TABLE yucer_pipeline.opportunity ALTER COLUMN stage_id SET NOT NULL;
ALTER TABLE yucer_pipeline.opportunity DROP CONSTRAINT fk_opportunity_stage;
ALTER TABLE yucer_pipeline.opportunity ADD CONSTRAINT fk_opportunity_stage FOREIGN KEY (workspace_id, stage_id)
  REFERENCES yucer_pipeline.stage_definition(workspace_id, id) ON DELETE RESTRICT;
CREATE INDEX idx_opportunity_stage_id ON yucer_pipeline.opportunity (workspace_id, stage_id);
CREATE FUNCTION yucer_pipeline.bind_opportunity_stage()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW.stage_id := yucer_pipeline.resolve_stage_reference(NEW.workspace_id, NEW.stage, 'fk_opportunity_stage');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION yucer_pipeline.bind_opportunity_stage() FROM PUBLIC;
CREATE TRIGGER bind_stage_uuid BEFORE INSERT OR UPDATE OF workspace_id, stage, stage_id
  ON yucer_pipeline.opportunity FOR EACH ROW EXECUTE FUNCTION yucer_pipeline.bind_opportunity_stage();

ALTER TABLE yucer_pipeline.opportunity_stage_event ADD COLUMN from_stage_id UUID;
UPDATE yucer_pipeline.opportunity_stage_event r SET from_stage_id = d.id
FROM yucer_pipeline.stage_definition d WHERE d.workspace_id = r.workspace_id AND d.stage_code = r.from_stage;
ALTER TABLE yucer_pipeline.opportunity_stage_event DROP CONSTRAINT fk_opportunity_stage_event_from_stage;
ALTER TABLE yucer_pipeline.opportunity_stage_event ADD CONSTRAINT fk_opportunity_stage_event_from_stage FOREIGN KEY (workspace_id, from_stage_id)
  REFERENCES yucer_pipeline.stage_definition(workspace_id, id) ON DELETE RESTRICT;
CREATE INDEX idx_opportunity_stage_event_from_stage_id ON yucer_pipeline.opportunity_stage_event (workspace_id, from_stage_id);
ALTER TABLE yucer_pipeline.opportunity_stage_event ADD COLUMN to_stage_id UUID;
UPDATE yucer_pipeline.opportunity_stage_event r SET to_stage_id = d.id
FROM yucer_pipeline.stage_definition d WHERE d.workspace_id = r.workspace_id AND d.stage_code = r.to_stage;
ALTER TABLE yucer_pipeline.opportunity_stage_event ALTER COLUMN to_stage_id SET NOT NULL;
ALTER TABLE yucer_pipeline.opportunity_stage_event DROP CONSTRAINT fk_opportunity_stage_event_to_stage;
ALTER TABLE yucer_pipeline.opportunity_stage_event ADD CONSTRAINT fk_opportunity_stage_event_to_stage FOREIGN KEY (workspace_id, to_stage_id)
  REFERENCES yucer_pipeline.stage_definition(workspace_id, id) ON DELETE RESTRICT;
CREATE INDEX idx_opportunity_stage_event_to_stage_id ON yucer_pipeline.opportunity_stage_event (workspace_id, to_stage_id);
CREATE FUNCTION yucer_pipeline.bind_opportunity_stage_event_stage()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW.from_stage_id := yucer_pipeline.resolve_stage_reference(NEW.workspace_id, NEW.from_stage, 'fk_opportunity_stage_event_from_stage');
  NEW.to_stage_id := yucer_pipeline.resolve_stage_reference(NEW.workspace_id, NEW.to_stage, 'fk_opportunity_stage_event_to_stage');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION yucer_pipeline.bind_opportunity_stage_event_stage() FROM PUBLIC;
CREATE TRIGGER bind_stage_uuid BEFORE INSERT OR UPDATE OF workspace_id, from_stage, from_stage_id, to_stage, to_stage_id
  ON yucer_pipeline.opportunity_stage_event FOR EACH ROW EXECUTE FUNCTION yucer_pipeline.bind_opportunity_stage_event_stage();

ALTER TABLE yucer_pipeline.stage_exit_criterion ADD COLUMN stage_id UUID;
UPDATE yucer_pipeline.stage_exit_criterion r SET stage_id = d.id
FROM yucer_pipeline.stage_definition d WHERE d.workspace_id = r.workspace_id AND d.stage_code = r.stage_code;
ALTER TABLE yucer_pipeline.stage_exit_criterion ALTER COLUMN stage_id SET NOT NULL;
ALTER TABLE yucer_pipeline.stage_exit_criterion DROP CONSTRAINT fk_exit_criterion_stage;
ALTER TABLE yucer_pipeline.stage_exit_criterion ADD CONSTRAINT fk_exit_criterion_stage FOREIGN KEY (workspace_id, stage_id)
  REFERENCES yucer_pipeline.stage_definition(workspace_id, id) ON DELETE CASCADE;
CREATE INDEX idx_stage_exit_criterion_stage_id ON yucer_pipeline.stage_exit_criterion (workspace_id, stage_id);
CREATE FUNCTION yucer_pipeline.bind_stage_exit_criterion_stage()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW.stage_id := yucer_pipeline.resolve_stage_reference(NEW.workspace_id, NEW.stage_code, 'fk_exit_criterion_stage');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION yucer_pipeline.bind_stage_exit_criterion_stage() FROM PUBLIC;
CREATE TRIGGER bind_stage_uuid BEFORE INSERT OR UPDATE OF workspace_id, stage_code, stage_id
  ON yucer_pipeline.stage_exit_criterion FOR EACH ROW EXECUTE FUNCTION yucer_pipeline.bind_stage_exit_criterion_stage();

COMMIT;
