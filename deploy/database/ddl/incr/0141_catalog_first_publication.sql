-- First publication is a recorded business event, not a creation/price date.
BEGIN;

ALTER TABLE yucer_catalog.product
  ADD COLUMN first_published_at TIMESTAMPTZ,
  ADD COLUMN publication_history_known BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE yucer_catalog.solution
  ADD COLUMN first_published_at TIMESTAMPTZ,
  ADD COLUMN publication_history_known BOOLEAN NOT NULL DEFAULT false;

-- Existing records stay unknown, including records later restored to sale.
-- Only newly inserted records have a complete observable lifecycle.
ALTER TABLE yucer_catalog.product ALTER COLUMN publication_history_known SET DEFAULT true;
ALTER TABLE yucer_catalog.solution ALTER COLUMN publication_history_known SET DEFAULT true;

CREATE FUNCTION yucer_catalog.record_product_first_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.publication_history_known := true;
    NEW.first_published_at := NULL;
  ELSE
    NEW.publication_history_known := OLD.publication_history_known;
    NEW.first_published_at := OLD.first_published_at;
  END IF;
  IF NEW.publication_history_known AND NEW.first_published_at IS NULL
    AND EXISTS (SELECT 1 FROM yucer_catalog.product_status s
      WHERE s.workspace_id = NEW.workspace_id AND s.id = NEW.status_id AND s.status_code = 'active') THEN
    NEW.first_published_at := statement_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION yucer_catalog.record_solution_first_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.publication_history_known := true;
    NEW.first_published_at := NULL;
  ELSE
    NEW.publication_history_known := OLD.publication_history_known;
    NEW.first_published_at := OLD.first_published_at;
  END IF;
  IF NEW.publication_history_known AND NEW.first_published_at IS NULL AND NEW.status = 'active' THEN
    NEW.first_published_at := statement_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER record_product_first_publication
  BEFORE INSERT OR UPDATE ON yucer_catalog.product
  FOR EACH ROW EXECUTE FUNCTION yucer_catalog.record_product_first_publication();
CREATE TRIGGER record_solution_first_publication
  BEFORE INSERT OR UPDATE ON yucer_catalog.solution
  FOR EACH ROW EXECUTE FUNCTION yucer_catalog.record_solution_first_publication();

-- Existing column UPDATE grants deliberately exclude these trigger-owned facts.
REVOKE ALL ON FUNCTION yucer_catalog.record_product_first_publication() FROM PUBLIC;
REVOKE ALL ON FUNCTION yucer_catalog.record_solution_first_publication() FROM PUBLIC;

COMMIT;
