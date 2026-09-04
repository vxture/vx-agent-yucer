-- 0026_person_and_affiliation.sql - a person is not a column on a company.
--
-- Authority: ADR-024, batch C, accepted by the owner on 2026-09-04.
--
-- THE WHOLE MIGRATION IS A RENAME, and that is the point rather than a
-- shortcut. yucer_core.contact carried three different things: a PERSON, that
-- person's EMPLOYMENT at one company, and that person's influence on a deal.
-- This splits the first two. It does not create a new table for people and
-- repoint anything at it, because it cannot:
--
--   interaction_participant   yucer_svc has INSERT / SELECT and nothing else
--   commitment                narrow column UPDATE, NOT counterpart_contact_id
--   account_relation          DELETE / INSERT / SELECT, no UPDATE at all
--
-- Those three hold the foreign keys into contact(id), and the application
-- deliberately cannot rewrite them - they are evidence. "New table, repoint the
-- references" is an UPDATE, and that grant does not exist. It is not a policy
-- we could relax for one migration either; the point of an append-only evidence
-- table is that nothing rewrites its attribution.
--
-- ALTER TABLE ... RENAME TO keeps every foreign key valid, because a foreign
-- key references the table's OID and not its name. So all four constraints
-- above survive untouched, every existing UUID still resolves, and no evidence
-- row is read, written or migrated. That is the entire reason ADR-024 insists
-- on keeping the id.
--
-- WHAT STAYS ON person FOR NOW: decision_role and influence. ADR-024 says they
-- belong on the OPPORTUNITY, not the person, and it is right - but the table
-- that receives them (opportunity_contact) is batch D. Dropping them here would
-- leave analyzeChain with no data at all and the decision chain blank on every
-- screen, which is a worse state than the one being fixed. They ride along, and
-- batch D moves them.
--
-- IDEMPOTENT, like every increment, which takes more care here than usual: a
-- rename is not naturally re-runnable and neither is a backfill. Every step
-- below is guarded on the state it would create.

-- --- 1. contact becomes person ---------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'yucer_core' AND table_name = 'contact'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'yucer_core' AND table_name = 'person'
  ) THEN
    ALTER TABLE yucer_core.contact RENAME TO person;
  END IF;
END $$;

-- --- 2. employment becomes its own row, with a start and an end ------------
--
-- WHY started_at / ended_at RATHER THAN A STATUS. "He left in March" and "he is
-- at the new company now" are the same event seen twice, and a status column
-- can only hold the second. The dates make "where is he now" and "where was he
-- when he promised us that" the same query with a different instant - and the
-- second question is the one a salesperson actually asks when reading an old
-- commitment.
--
-- NULL ended_at IS CURRENT. Not a sentinel date: an employment with no end has
-- no end, and 9999-12-31 would make every range comparison quietly wrong at the
-- edges.
CREATE TABLE IF NOT EXISTS yucer_core.person_affiliation (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                          -- [ref] isolation key
  person_id    UUID NOT NULL,
  account_id   UUID NOT NULL,
  title        VARCHAR(255),
  department   VARCHAR(128),
  -- Which employment to show when a person has more than one. Not enforced as
  -- "exactly one true" by a constraint: a person legitimately has none marked
  -- while somebody decides, and a partial unique index on (person_id) WHERE
  -- is_primary would make setting a new primary a two-statement dance under a
  -- grant that has no transaction guarantees at this layer.
  is_primary   BOOLEAN NOT NULL DEFAULT true,
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_person_affiliation_person FOREIGN KEY (person_id)
    REFERENCES yucer_core.person (id) ON DELETE CASCADE,
  CONSTRAINT fk_person_affiliation_account FOREIGN KEY (account_id)
    REFERENCES yucer_core.account (id) ON DELETE CASCADE,
  -- One person is employed by one company once at a time. A re-hire is a new
  -- row with a new started_at, and the index deliberately does not include the
  -- dates: two OPEN employments at the same company is the data error this
  -- catches, and it is the one that would silently double every contact count.
  CONSTRAINT chk_person_affiliation_dates
    CHECK (started_at IS NULL OR ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_person_affiliation_current
  ON yucer_core.person_affiliation (person_id, account_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_person_affiliation_ws_account
  ON yucer_core.person_affiliation (workspace_id, account_id);
CREATE INDEX IF NOT EXISTS idx_person_affiliation_ws_person
  ON yucer_core.person_affiliation (workspace_id, person_id);

-- --- 3. backfill one affiliation per existing person -----------------------
--
-- Every person on file today has exactly one employer, because the old schema
-- could not express a second. started_at is NULL rather than now(): we do not
-- know when they joined, and stamping the migration date would assert that
-- everyone started on the day this ran.
--
-- Guarded on the source column still existing, so a re-run after step 4 is a
-- no-op rather than an error.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'yucer_core' AND table_name = 'person' AND column_name = 'account_id'
  ) THEN
    INSERT INTO yucer_core.person_affiliation
      (workspace_id, person_id, account_id, title, department, is_primary)
    SELECT p.workspace_id, p.id, p.account_id, p.title, p.department, true
      FROM yucer_core.person p
     WHERE NOT EXISTS (
       SELECT 1 FROM yucer_core.person_affiliation a
        WHERE a.person_id = p.id AND a.account_id = p.account_id AND a.ended_at IS NULL
     );
  END IF;
END $$;

-- --- 4. the employment columns leave person --------------------------------
--
-- ONLY AFTER THE BACKFILL, and the order is the migration: dropping first would
-- destroy the only copy of who worked where. fk_contact_account goes with
-- account_id automatically.
ALTER TABLE yucer_core.person
  DROP COLUMN IF EXISTS account_id,
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS department;

-- --- 5. names that still say "contact" -------------------------------------
--
-- COSMETIC BUT NOT OPTIONAL. A constraint name appears in the error a caller
-- sees and in the tests that assert on it, so leaving chk_contact_status on a
-- table called person means every future reader has to know this history to
-- understand the message. Guarded individually: a partial re-run must not fail
-- on the ones already renamed.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'yucer_core.person'::regclass
       AND conname LIKE '%contact%'
  LOOP
    EXECUTE format('ALTER TABLE yucer_core.person RENAME CONSTRAINT %I TO %I',
                   r.conname, replace(r.conname, 'contact', 'person'));
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT indexname FROM pg_indexes
     WHERE schemaname = 'yucer_core' AND tablename = 'person'
       AND indexname LIKE '%contact%'
  LOOP
    EXECUTE format('ALTER INDEX yucer_core.%I RENAME TO %I',
                   r.indexname, replace(r.indexname, 'contact', 'person'));
  END LOOP;
END $$;

-- --- 6. grants -------------------------------------------------------------
--
-- The rename carried the old grants with it (they follow the OID too), but the
-- column list is now wrong: title and department are gone, and naming a dropped
-- column in a GRANT is an error. Restated in full.
--
-- person_affiliation is a table created by an increment, so 97's
-- GRANT ON ALL TABLES - evaluated at grant time - never saw it and it has NO
-- privileges at all until granted here. check-incr-grants.mjs enforces this.
REVOKE UPDATE ON yucer_core.person FROM yucer_svc;
GRANT UPDATE (name, decision_role, influence, email, mobile, wechat,
              status, updated_at, deleted_at)
  ON yucer_core.person TO yucer_svc;

GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_core.person_affiliation TO yucer_svc;
REVOKE UPDATE ON yucer_core.person_affiliation FROM yucer_svc;
-- person_id and account_id are the edge itself. Moving somebody to a different
-- company by editing this row would rewrite history rather than record a
-- change; that is a new row with the old one's ended_at set, which is why
-- ended_at IS writable and the two keys are not.
GRANT UPDATE (title, department, is_primary, started_at, ended_at, updated_at)
  ON yucer_core.person_affiliation TO yucer_svc;
