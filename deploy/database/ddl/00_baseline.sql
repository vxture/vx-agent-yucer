-- Business-face DB baseline (product_240 section 2.4, data_platform_100 section
-- 2.3.1). Single DDL authority - hand-written, create-once (never ALTER an
-- existing table here; structure changes ship as numbered incr/ increments via
-- db-init). Three contract schemas ship from the factory; N domain schemas are a
-- product blank zone (must not use the reserved contract-schema names).
--
-- Naming (data_platform_100 section 3.2): uuid PK gen_random_uuid(); TIMESTAMPTZ
-- created_at/updated_at/deleted_at; status VARCHAR(32)+CHECK (never PG ENUM);
-- idx_/uidx_/fk_/chk_ prefixes. Anchor columns (id, *_no, created_at) are
-- immutable - locked in 98_column_locks.sql.
--
-- Product-side rows hold only platform REFERENCE keys (workspace_id/tenant_id/
-- sub); they are platform-issued, never product-declared, and are NOT a mirror
-- of the platform's four-layer identity model (data_platform_100 section 2.3.2).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ===========================================================================
-- vx_provision  (platform-driven provisioning + inbound webhook event log)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS vx_provision;

CREATE TABLE IF NOT EXISTS vx_provision.app_instance (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref] authoritative isolation key
  tenant_id      UUID,                                -- [ref] rollup only
  product_code   VARCHAR(32) NOT NULL,                -- [ref]
  status         VARCHAR(32) NOT NULL DEFAULT 'pending'
                   CONSTRAINT chk_app_instance_status
                   CHECK (status IN ('pending', 'provisioned', 'deprovisioned')),
  env            VARCHAR(32) NOT NULL DEFAULT 'prod'
                   CONSTRAINT chk_app_instance_env CHECK (env IN ('beta', 'prod')),
  provisioned_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_app_instance_ws_product UNIQUE (workspace_id, product_code)
);

-- Inbound webhook idempotency ledger (append-only; delivery_id = payload.id).
CREATE TABLE IF NOT EXISTS vx_provision.webhook_delivery (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  VARCHAR(128) NOT NULL,                 -- [ref] = payload.id / X-Vxture-Delivery
  type         VARCHAR(64) NOT NULL,
  occurred_at  TIMESTAMPTZ,
  result       VARCHAR(32) NOT NULL DEFAULT 'processed'
                 CONSTRAINT chk_webhook_delivery_result
                 CHECK (result IN ('processed', 'duplicate', 'stale', 'ignored')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_webhook_delivery_delivery_id UNIQUE (delivery_id)
);

-- Per (workspace_id, product_code) processed-seq watermark (drop stale/reordered).
CREATE TABLE IF NOT EXISTS vx_provision.provision_seq (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                         -- [ref]
  product_code VARCHAR(32) NOT NULL,                  -- [ref]
  last_seq     BIGINT NOT NULL DEFAULT 0,             -- [ref] = payload.seq
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_provision_seq_ws_product UNIQUE (workspace_id, product_code)
);

-- ===========================================================================
-- local_authz  (product members + function roles; product-owned, NOT a mirror
-- of the platform governance role catalog access.roles)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS local_authz;

-- Lazy subset: upserted on first login sighting of (workspace_id, sub). This is
-- NOT the full/real-time mirror of tenancy.workspace_memberships.
CREATE TABLE IF NOT EXISTS local_authz.member (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref]
  sub            VARCHAR(128) NOT NULL,               -- [ref] full "usr_<uuid>"
  display_name   VARCHAR(255),                        -- platform cache (may go stale)
  avatar_hash    VARCHAR(128),                        -- platform cache
  status         VARCHAR(32) NOT NULL DEFAULT 'active'
                   CONSTRAINT chk_member_status CHECK (status IN ('active', 'inactive')),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_member_ws_sub UNIQUE (workspace_id, sub)
);

-- Product function-role catalog (product seed; e.g. reviewer/editor). This is
-- NOT the platform governance role domain (owner/manager/member/readonly/guest).
CREATE TABLE IF NOT EXISTS local_authz.role (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code   VARCHAR(64) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_role_role_code UNIQUE (role_code)
);

CREATE TABLE IF NOT EXISTS local_authz.permission (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perm_code   VARCHAR(64) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_permission_perm_code UNIQUE (perm_code)
);

CREATE TABLE IF NOT EXISTS local_authz.member_role (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL,
  role_id     UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_member_role_member FOREIGN KEY (member_id) REFERENCES local_authz.member (id) ON DELETE CASCADE,
  CONSTRAINT fk_member_role_role FOREIGN KEY (role_id) REFERENCES local_authz.role (id) ON DELETE CASCADE,
  CONSTRAINT uidx_member_role_member_role UNIQUE (member_id, role_id)
);

CREATE TABLE IF NOT EXISTS local_authz.role_permission (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id        UUID NOT NULL,
  permission_id  UUID NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id) REFERENCES local_authz.role (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id) REFERENCES local_authz.permission (id) ON DELETE CASCADE,
  CONSTRAINT uidx_role_permission_role_perm UNIQUE (role_id, permission_id)
);

-- ===========================================================================
-- local_usage  (local counter-usage buffer; platform metering is the SoT)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS local_usage;

-- Only COUNTER usage is buffered here; gauge is a direct PUT, caps are counted
-- locally. idempotency_key is mandatory (defeats replay/double-count).
CREATE TABLE IF NOT EXISTS local_usage.raw (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL,                     -- [ref]
  metric           VARCHAR(128) NOT NULL,             -- [ref] must hit a platform metric registry key
  amount           BIGINT NOT NULL,
  idempotency_key  VARCHAR(128) NOT NULL,
  flushed          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_raw_amount CHECK (amount > 0),
  CONSTRAINT uidx_raw_idempotency_key UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_raw_unflushed ON local_usage.raw (flushed) WHERE flushed = false;

-- Product-local flush watermark (no platform counterpart).
CREATE TABLE IF NOT EXISTS local_usage.checkpoint (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  metric        VARCHAR(128) NOT NULL,
  flushed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_checkpoint_ws_metric UNIQUE (workspace_id, metric)
);

-- ###########################################################################
-- PRODUCT DOMAIN SCHEMAS (yucer) - the blank zone filled by this product.
--
-- Five domain schemas carry the eight capability domains of the sales
-- super-agent (design_yucer_100_capability-domains.md maps domain -> schema):
--
--   yucer_core      account master data           (D4 account)
--   yucer_gtm       strategy / planning / campaign (D1 strategy, D2 planning,
--                                                   D3 campaign)
--   yucer_pipeline  signal -> lead -> opportunity  (D5 signal, D6 pipeline)
--   yucer_delivery  post-win delivery and revenue  (D7 delivery)
--   yucer_agent     copilot sessions and actions   (D8 copilot)
--
-- Every root table carries workspace_id as the authoritative isolation key
-- (never inferred, always the platform-issued value). owner_sub / actor_sub are
-- platform REFERENCE keys ("usr_<uuid>"), never a local identity model.
-- Conventions are the same as above: uuid PK gen_random_uuid(); TIMESTAMPTZ
-- created_at/updated_at/deleted_at; status VARCHAR(32)+CHECK (never PG ENUM);
-- money NUMERIC(18,2) + currency VARCHAR(8); idx_/uidx_/fk_/chk_ prefixes.
-- Anchor columns (id, *_no, created_at) are immutable - locked in
-- 98_column_locks.sql.
-- ###########################################################################

-- ===========================================================================
-- yucer_core  (D4 account management - customer master data and relationships)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS yucer_core;

-- Customer account. account_no is the human-facing immutable business number.
CREATE TABLE IF NOT EXISTS yucer_core.account (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  account_no    VARCHAR(64) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(255) NOT NULL,
  industry      VARCHAR(64),
  region        VARCHAR(64),
  segment_code  VARCHAR(64),                          -- -> yucer_gtm.market_segment
  owner_sub     VARCHAR(128),                         -- [ref] account owner
  health_score  SMALLINT,                             -- 0-100, agent-maintained
  status        VARCHAR(32) NOT NULL DEFAULT 'prospect'
                  CONSTRAINT chk_account_status
                  CHECK (status IN ('prospect', 'active', 'dormant', 'churned')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT chk_account_health CHECK (health_score IS NULL OR (health_score BETWEEN 0 AND 100)),
  CONSTRAINT uidx_account_ws_no UNIQUE (workspace_id, account_no)
);
CREATE INDEX IF NOT EXISTS idx_account_ws_owner ON yucer_core.account (workspace_id, owner_sub);
CREATE INDEX IF NOT EXISTS idx_account_ws_status ON yucer_core.account (workspace_id, status);

-- Contact inside an account. influence/decision_role drive the relationship map.
CREATE TABLE IF NOT EXISTS yucer_core.contact (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref]
  account_id     UUID NOT NULL,
  name           VARCHAR(255) NOT NULL,
  title          VARCHAR(255),
  department     VARCHAR(128),
  decision_role  VARCHAR(32) NOT NULL DEFAULT 'unknown'
                   CONSTRAINT chk_contact_decision_role
                   CHECK (decision_role IN ('economic', 'technical', 'user', 'coach', 'blocker', 'unknown')),
  influence      SMALLINT,                            -- 0-100
  status         VARCHAR(32) NOT NULL DEFAULT 'active'
                   CONSTRAINT chk_contact_status CHECK (status IN ('active', 'left', 'invalid')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT chk_contact_influence CHECK (influence IS NULL OR (influence BETWEEN 0 AND 100)),
  CONSTRAINT fk_contact_account FOREIGN KEY (account_id) REFERENCES yucer_core.account (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contact_ws_account ON yucer_core.contact (workspace_id, account_id);

-- Directed edge of the account relationship graph (reports-to, allied-with, ...).
CREATE TABLE IF NOT EXISTS yucer_core.account_relation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                      -- [ref]
  from_contact_id UUID NOT NULL,
  to_contact_id   UUID NOT NULL,
  relation_type   VARCHAR(32) NOT NULL
                    CONSTRAINT chk_account_relation_type
                    CHECK (relation_type IN ('reports_to', 'peer_of', 'allied_with', 'opposed_to', 'referred_by')),
  strength        SMALLINT,                           -- 0-100
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_account_relation_self CHECK (from_contact_id <> to_contact_id),
  CONSTRAINT chk_account_relation_strength CHECK (strength IS NULL OR (strength BETWEEN 0 AND 100)),
  CONSTRAINT fk_account_relation_from FOREIGN KEY (from_contact_id) REFERENCES yucer_core.contact (id) ON DELETE CASCADE,
  CONSTRAINT fk_account_relation_to FOREIGN KEY (to_contact_id) REFERENCES yucer_core.contact (id) ON DELETE CASCADE,
  CONSTRAINT uidx_account_relation_edge UNIQUE (from_contact_id, to_contact_id, relation_type)
);

-- ===========================================================================
-- yucer_gtm  (D1 strategy, D2 planning, D3 campaign execution)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS yucer_gtm;

-- Go-to-market strategy for a period. The top of the strategy -> plan ->
-- campaign -> pipeline chain; everything downstream can trace back to a plan.
CREATE TABLE IF NOT EXISTS yucer_gtm.strategy_plan (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  plan_no       VARCHAR(64) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(255) NOT NULL,
  period        VARCHAR(32) NOT NULL,                 -- e.g. 2026H1, 2026Q3, FY26
  objective     TEXT,
  owner_sub     VARCHAR(128),                         -- [ref]
  status        VARCHAR(32) NOT NULL DEFAULT 'draft'
                  CONSTRAINT chk_strategy_plan_status
                  CHECK (status IN ('draft', 'approved', 'active', 'closed', 'archived')),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_strategy_plan_ws_no UNIQUE (workspace_id, plan_no)
);
CREATE INDEX IF NOT EXISTS idx_strategy_plan_ws_period ON yucer_gtm.strategy_plan (workspace_id, period);

-- Target market segment (the addressable-market decomposition of a strategy).
CREATE TABLE IF NOT EXISTS yucer_gtm.market_segment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  segment_code  VARCHAR(64) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(255) NOT NULL,
  plan_id       UUID,
  criteria      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- industry/size/region filters
  priority      SMALLINT NOT NULL DEFAULT 0,
  status        VARCHAR(32) NOT NULL DEFAULT 'active'
                  CONSTRAINT chk_market_segment_status CHECK (status IN ('active', 'paused', 'retired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_market_segment_plan FOREIGN KEY (plan_id) REFERENCES yucer_gtm.strategy_plan (id) ON DELETE SET NULL,
  CONSTRAINT uidx_market_segment_ws_code UNIQUE (workspace_id, segment_code)
);

-- Sales territory (coverage unit that quota is assigned against).
CREATE TABLE IF NOT EXISTS yucer_gtm.territory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                      -- [ref]
  territory_code  VARCHAR(64) NOT NULL,               -- anchor, immutable
  name            VARCHAR(255) NOT NULL,
  parent_id       UUID,
  owner_sub       VARCHAR(128),                       -- [ref]
  status          VARCHAR(32) NOT NULL DEFAULT 'active'
                    CONSTRAINT chk_territory_status CHECK (status IN ('active', 'retired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_territory_parent FOREIGN KEY (parent_id) REFERENCES yucer_gtm.territory (id) ON DELETE SET NULL,
  CONSTRAINT uidx_territory_ws_code UNIQUE (workspace_id, territory_code)
);

-- Quota / target assigned to a person or a territory for a period.
CREATE TABLE IF NOT EXISTS yucer_gtm.sales_target (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  plan_id       UUID,
  period        VARCHAR(32) NOT NULL,
  scope_type    VARCHAR(32) NOT NULL
                  CONSTRAINT chk_sales_target_scope
                  CHECK (scope_type IN ('workspace', 'territory', 'owner')),
  territory_id  UUID,
  owner_sub     VARCHAR(128),                         -- [ref]
  metric        VARCHAR(64) NOT NULL DEFAULT 'revenue'
                  CONSTRAINT chk_sales_target_metric
                  CHECK (metric IN ('revenue', 'new_logo', 'pipeline', 'margin')),
  target_amount NUMERIC(18, 2) NOT NULL,
  currency      VARCHAR(8) NOT NULL DEFAULT 'CNY',
  status        VARCHAR(32) NOT NULL DEFAULT 'draft'
                  CONSTRAINT chk_sales_target_status
                  CHECK (status IN ('draft', 'committed', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_sales_target_amount CHECK (target_amount >= 0),
  CONSTRAINT fk_sales_target_plan FOREIGN KEY (plan_id) REFERENCES yucer_gtm.strategy_plan (id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_target_territory FOREIGN KEY (territory_id) REFERENCES yucer_gtm.territory (id) ON DELETE SET NULL,
  CONSTRAINT uidx_sales_target_scope UNIQUE (workspace_id, period, scope_type, territory_id, owner_sub, metric)
);

-- Marketing / demand-generation campaign - the execution arm of a plan.
CREATE TABLE IF NOT EXISTS yucer_gtm.campaign (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  campaign_no   VARCHAR(64) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(255) NOT NULL,
  plan_id       UUID,
  segment_id    UUID,
  channel       VARCHAR(64),                          -- event/webinar/outbound/content/partner
  budget_amount NUMERIC(18, 2),
  currency      VARCHAR(8) NOT NULL DEFAULT 'CNY',
  owner_sub     VARCHAR(128),                         -- [ref]
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  status        VARCHAR(32) NOT NULL DEFAULT 'draft'
                  CONSTRAINT chk_campaign_status
                  CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_campaign_budget CHECK (budget_amount IS NULL OR budget_amount >= 0),
  CONSTRAINT chk_campaign_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT fk_campaign_plan FOREIGN KEY (plan_id) REFERENCES yucer_gtm.strategy_plan (id) ON DELETE SET NULL,
  CONSTRAINT fk_campaign_segment FOREIGN KEY (segment_id) REFERENCES yucer_gtm.market_segment (id) ON DELETE SET NULL,
  CONSTRAINT uidx_campaign_ws_no UNIQUE (workspace_id, campaign_no)
);
CREATE INDEX IF NOT EXISTS idx_campaign_ws_status ON yucer_gtm.campaign (workspace_id, status);

-- One executable step of a campaign (the "landing" unit of market execution).
CREATE TABLE IF NOT EXISTS yucer_gtm.campaign_execution (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  campaign_id   UUID NOT NULL,
  title         VARCHAR(255) NOT NULL,
  action_type   VARCHAR(32) NOT NULL
                  CONSTRAINT chk_campaign_execution_action
                  CHECK (action_type IN ('outreach', 'content', 'event', 'nurture', 'handoff')),
  assignee_sub  VARCHAR(128),                         -- [ref]
  due_at        TIMESTAMPTZ,
  status        VARCHAR(32) NOT NULL DEFAULT 'pending'
                  CONSTRAINT chk_campaign_execution_status
                  CHECK (status IN ('pending', 'in_progress', 'done', 'skipped')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_campaign_execution_campaign FOREIGN KEY (campaign_id) REFERENCES yucer_gtm.campaign (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_execution_ws_status ON yucer_gtm.campaign_execution (workspace_id, status);

-- ===========================================================================
-- yucer_pipeline  (D5 signal detection, D6 opportunity management)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS yucer_pipeline;

-- Raw buying signal picked up by the detective domain. Append-mostly: a signal
-- is evidence, it is never rewritten - it is scored, then promoted or dismissed.
CREATE TABLE IF NOT EXISTS yucer_pipeline.signal (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  source        VARCHAR(64) NOT NULL,                 -- web/news/campaign/crm/manual/partner
  source_ref    VARCHAR(255),                         -- external id or URL, dedup input
  signal_type   VARCHAR(32) NOT NULL
                  CONSTRAINT chk_signal_type
                  CHECK (signal_type IN ('intent', 'hiring', 'funding', 'tech_change', 'engagement', 'referral', 'other')),
  account_id    UUID,                                 -- resolved account, if matched
  subject       VARCHAR(255) NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  score         SMALLINT,                             -- 0-100, model-assigned
  status        VARCHAR(32) NOT NULL DEFAULT 'new'
                  CONSTRAINT chk_signal_status
                  CHECK (status IN ('new', 'scored', 'promoted', 'dismissed', 'duplicate')),
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_signal_score CHECK (score IS NULL OR (score BETWEEN 0 AND 100)),
  CONSTRAINT fk_signal_account FOREIGN KEY (account_id) REFERENCES yucer_core.account (id) ON DELETE SET NULL,
  CONSTRAINT uidx_signal_ws_source_ref UNIQUE (workspace_id, source, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_signal_ws_status_score ON yucer_pipeline.signal (workspace_id, status, score DESC);

-- Qualified lead promoted from one or more signals, before it becomes an
-- opportunity. converted_opportunity_id closes the loop for attribution.
CREATE TABLE IF NOT EXISTS yucer_pipeline.lead (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL,              -- [ref]
  lead_no                 VARCHAR(64) NOT NULL,       -- anchor, immutable
  company_name            VARCHAR(255) NOT NULL,
  contact_name            VARCHAR(255),
  account_id              UUID,
  signal_id               UUID,
  campaign_id             UUID,                       -- [attribution] source campaign
  score                   SMALLINT,                   -- 0-100
  owner_sub               VARCHAR(128),               -- [ref]
  status                  VARCHAR(32) NOT NULL DEFAULT 'new'
                            CONSTRAINT chk_lead_status
                            CHECK (status IN ('new', 'working', 'qualified', 'converted', 'disqualified')),
  converted_opportunity_id UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_lead_score CHECK (score IS NULL OR (score BETWEEN 0 AND 100)),
  CONSTRAINT fk_lead_account FOREIGN KEY (account_id) REFERENCES yucer_core.account (id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_signal FOREIGN KEY (signal_id) REFERENCES yucer_pipeline.signal (id) ON DELETE SET NULL,
  CONSTRAINT fk_lead_campaign FOREIGN KEY (campaign_id) REFERENCES yucer_gtm.campaign (id) ON DELETE SET NULL,
  CONSTRAINT uidx_lead_ws_no UNIQUE (workspace_id, lead_no)
);
CREATE INDEX IF NOT EXISTS idx_lead_ws_status ON yucer_pipeline.lead (workspace_id, status);

-- The opportunity. stage is the product's stage machine; probability and
-- forecast_category drive the roll-up. Stage transitions are journalled in
-- opportunity_stage_event, never inferred from updated_at.
CREATE TABLE IF NOT EXISTS yucer_pipeline.opportunity (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,                    -- [ref]
  opportunity_no    VARCHAR(64) NOT NULL,             -- anchor, immutable
  name              VARCHAR(255) NOT NULL,
  account_id        UUID NOT NULL,
  plan_id           UUID,                             -- [traceability] back to strategy
  campaign_id       UUID,                             -- [attribution]
  territory_id      UUID,
  owner_sub         VARCHAR(128),                     -- [ref]
  stage             VARCHAR(32) NOT NULL DEFAULT 'qualify'
                      CONSTRAINT chk_opportunity_stage
                      CHECK (stage IN ('qualify', 'discover', 'validate', 'propose', 'negotiate', 'won', 'lost')),
  forecast_category VARCHAR(32) NOT NULL DEFAULT 'pipeline'
                      CONSTRAINT chk_opportunity_forecast_category
                      CHECK (forecast_category IN ('pipeline', 'best_case', 'commit', 'closed')),
  amount            NUMERIC(18, 2),
  currency          VARCHAR(8) NOT NULL DEFAULT 'CNY',
  probability       SMALLINT,                         -- 0-100
  expected_close_at TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  status            VARCHAR(32) NOT NULL DEFAULT 'open'
                      CONSTRAINT chk_opportunity_status
                      CHECK (status IN ('open', 'won', 'lost', 'abandoned')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT chk_opportunity_amount CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT chk_opportunity_probability CHECK (probability IS NULL OR (probability BETWEEN 0 AND 100)),
  CONSTRAINT fk_opportunity_account FOREIGN KEY (account_id) REFERENCES yucer_core.account (id) ON DELETE RESTRICT,
  CONSTRAINT fk_opportunity_plan FOREIGN KEY (plan_id) REFERENCES yucer_gtm.strategy_plan (id) ON DELETE SET NULL,
  CONSTRAINT fk_opportunity_campaign FOREIGN KEY (campaign_id) REFERENCES yucer_gtm.campaign (id) ON DELETE SET NULL,
  CONSTRAINT fk_opportunity_territory FOREIGN KEY (territory_id) REFERENCES yucer_gtm.territory (id) ON DELETE SET NULL,
  CONSTRAINT uidx_opportunity_ws_no UNIQUE (workspace_id, opportunity_no)
);
CREATE INDEX IF NOT EXISTS idx_opportunity_ws_stage ON yucer_pipeline.opportunity (workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_opportunity_ws_owner_close ON yucer_pipeline.opportunity (workspace_id, owner_sub, expected_close_at);

-- Append-only stage-transition journal (the audit trail behind velocity and
-- conversion analytics). Never updated - a correction is a new event.
CREATE TABLE IF NOT EXISTS yucer_pipeline.opportunity_stage_event (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                      -- [ref]
  opportunity_id  UUID NOT NULL,
  from_stage      VARCHAR(32),
  to_stage        VARCHAR(32) NOT NULL,
  reason          VARCHAR(255),
  actor_sub       VARCHAR(128),                       -- [ref] null = agent-driven
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_opportunity_stage_event_move CHECK (from_stage IS NULL OR from_stage <> to_stage),
  CONSTRAINT fk_opportunity_stage_event_opp FOREIGN KEY (opportunity_id) REFERENCES yucer_pipeline.opportunity (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_opportunity_stage_event_opp ON yucer_pipeline.opportunity_stage_event (opportunity_id, occurred_at);

-- Immutable point-in-time forecast roll-up (one row per scope per period per
-- snapshot). Append-only: re-forecasting writes a new snapshot.
CREATE TABLE IF NOT EXISTS yucer_pipeline.forecast_snapshot (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref]
  period         VARCHAR(32) NOT NULL,
  scope_type     VARCHAR(32) NOT NULL
                   CONSTRAINT chk_forecast_snapshot_scope
                   CHECK (scope_type IN ('workspace', 'territory', 'owner')),
  territory_id   UUID,
  owner_sub      VARCHAR(128),                        -- [ref]
  commit_amount  NUMERIC(18, 2) NOT NULL DEFAULT 0,
  best_case_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  pipeline_amount  NUMERIC(18, 2) NOT NULL DEFAULT 0,
  closed_amount    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency       VARCHAR(8) NOT NULL DEFAULT 'CNY',
  snapshot_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_forecast_snapshot_amounts CHECK (
    commit_amount >= 0 AND best_case_amount >= 0 AND pipeline_amount >= 0 AND closed_amount >= 0
  ),
  CONSTRAINT fk_forecast_snapshot_territory FOREIGN KEY (territory_id) REFERENCES yucer_gtm.territory (id) ON DELETE SET NULL,
  CONSTRAINT uidx_forecast_snapshot_scope_at UNIQUE (workspace_id, period, scope_type, territory_id, owner_sub, snapshot_at)
);

-- Win/loss review - the learning loop that feeds strategy and the copilot.
CREATE TABLE IF NOT EXISTS yucer_pipeline.win_loss_review (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL,                     -- [ref]
  opportunity_id   UUID NOT NULL,
  outcome          VARCHAR(32) NOT NULL
                     CONSTRAINT chk_win_loss_review_outcome CHECK (outcome IN ('won', 'lost')),
  primary_reason   VARCHAR(64),                       -- price/fit/timing/competitor/no_decision
  competitor       VARCHAR(255),
  lessons          TEXT,
  reviewer_sub     VARCHAR(128),                      -- [ref]
  reviewed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_win_loss_review_opp FOREIGN KEY (opportunity_id) REFERENCES yucer_pipeline.opportunity (id) ON DELETE CASCADE,
  CONSTRAINT uidx_win_loss_review_opp UNIQUE (opportunity_id)
);

-- ===========================================================================
-- yucer_delivery  (D7 project management - post-win landing and revenue)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS yucer_delivery;

-- Delivery project created from a won opportunity. This is where "landing"
-- happens: the strategy chain terminates in delivered, collected revenue.
CREATE TABLE IF NOT EXISTS yucer_delivery.project (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                      -- [ref]
  project_no      VARCHAR(64) NOT NULL,               -- anchor, immutable
  name            VARCHAR(255) NOT NULL,
  opportunity_id  UUID,
  account_id      UUID NOT NULL,
  manager_sub     VARCHAR(128),                       -- [ref]
  contract_amount NUMERIC(18, 2),
  currency        VARCHAR(8) NOT NULL DEFAULT 'CNY',
  health          VARCHAR(32) NOT NULL DEFAULT 'green'
                    CONSTRAINT chk_project_health CHECK (health IN ('green', 'amber', 'red')),
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  status          VARCHAR(32) NOT NULL DEFAULT 'planning'
                    CONSTRAINT chk_project_status
                    CHECK (status IN ('planning', 'active', 'on_hold', 'delivered', 'closed', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_project_amount CHECK (contract_amount IS NULL OR contract_amount >= 0),
  CONSTRAINT chk_project_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT fk_project_opportunity FOREIGN KEY (opportunity_id) REFERENCES yucer_pipeline.opportunity (id) ON DELETE SET NULL,
  CONSTRAINT fk_project_account FOREIGN KEY (account_id) REFERENCES yucer_core.account (id) ON DELETE RESTRICT,
  CONSTRAINT uidx_project_ws_no UNIQUE (workspace_id, project_no)
);
CREATE INDEX IF NOT EXISTS idx_project_ws_status ON yucer_delivery.project (workspace_id, status);

CREATE TABLE IF NOT EXISTS yucer_delivery.project_milestone (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                         -- [ref]
  project_id   UUID NOT NULL,
  name         VARCHAR(255) NOT NULL,
  sequence     SMALLINT NOT NULL DEFAULT 0,
  due_at       TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status       VARCHAR(32) NOT NULL DEFAULT 'pending'
                 CONSTRAINT chk_project_milestone_status
                 CHECK (status IN ('pending', 'in_progress', 'done', 'missed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_project_milestone_project FOREIGN KEY (project_id) REFERENCES yucer_delivery.project (id) ON DELETE CASCADE,
  CONSTRAINT uidx_project_milestone_seq UNIQUE (project_id, sequence)
);

-- project_task was here. Removed 2026-08-28 (ADR-022): a table, its column
-- locks and an action shipped in batch 1, and in the seven batches since,
-- nothing ever touched it - no record type, no port, no read, no surface, not
-- one demo row. This product is a SALES agent; task management belongs to a
-- delivery tool, and the table was a front it never declared it was opening.
--
-- Edited out of the create-once baseline rather than only dropped by an
-- increment, which incr/README forbids in general and which is safe here for a
-- reason that can be checked: this DDL has never built a database. Zero
-- deployment environments, zero release tags, zero db-init runs. incr/0014
-- ships the DROP anyway, for any checkout that applied the old baseline.


-- Planned vs recognized revenue instalments (the money side of landing).
CREATE TABLE IF NOT EXISTS yucer_delivery.revenue_schedule (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref]
  project_id     UUID NOT NULL,
  milestone_id   UUID,
  sequence       SMALLINT NOT NULL DEFAULT 0,
  planned_amount NUMERIC(18, 2) NOT NULL,
  actual_amount  NUMERIC(18, 2),
  currency       VARCHAR(8) NOT NULL DEFAULT 'CNY',
  due_at         TIMESTAMPTZ,
  settled_at     TIMESTAMPTZ,
  status         VARCHAR(32) NOT NULL DEFAULT 'planned'
                   CONSTRAINT chk_revenue_schedule_status
                   CHECK (status IN ('planned', 'invoiced', 'settled', 'overdue', 'written_off')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_revenue_schedule_amounts CHECK (
    planned_amount >= 0 AND (actual_amount IS NULL OR actual_amount >= 0)
  ),
  CONSTRAINT fk_revenue_schedule_project FOREIGN KEY (project_id) REFERENCES yucer_delivery.project (id) ON DELETE CASCADE,
  CONSTRAINT fk_revenue_schedule_milestone FOREIGN KEY (milestone_id) REFERENCES yucer_delivery.project_milestone (id) ON DELETE SET NULL,
  CONSTRAINT uidx_revenue_schedule_seq UNIQUE (project_id, sequence)
);

-- ===========================================================================
-- yucer_agent  (D8 sales copilot - sessions, proposed actions, playbooks)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS yucer_agent;

-- One copilot conversation, optionally anchored to a domain object.
CREATE TABLE IF NOT EXISTS yucer_agent.agent_session (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  actor_sub     VARCHAR(128) NOT NULL,                -- [ref] who is talking
  subject_type  VARCHAR(32)
                  CONSTRAINT chk_agent_session_subject
                  CHECK (subject_type IS NULL OR subject_type IN
                    ('account', 'lead', 'opportunity', 'project', 'campaign', 'plan')),
  subject_id    UUID,
  title         VARCHAR(255),
  status        VARCHAR(32) NOT NULL DEFAULT 'open'
                  CONSTRAINT chk_agent_session_status CHECK (status IN ('open', 'closed', 'archived')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_agent_session_subject_pair CHECK (
    (subject_type IS NULL AND subject_id IS NULL) OR (subject_type IS NOT NULL AND subject_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_agent_session_ws_actor ON yucer_agent.agent_session (workspace_id, actor_sub, updated_at DESC);

-- Append-only transcript. Never updated - an edit is a new message.
CREATE TABLE IF NOT EXISTS yucer_agent.agent_message (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                         -- [ref]
  session_id   UUID NOT NULL,
  seq          BIGINT NOT NULL,
  role         VARCHAR(32) NOT NULL
                 CONSTRAINT chk_agent_message_role CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content      TEXT NOT NULL,
  token_count  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_agent_message_seq CHECK (seq > 0),
  CONSTRAINT fk_agent_message_session FOREIGN KEY (session_id) REFERENCES yucer_agent.agent_session (id) ON DELETE CASCADE,
  CONSTRAINT uidx_agent_message_session_seq UNIQUE (session_id, seq)
);

-- A concrete next action the copilot proposes against a domain object.
-- Human-in-the-loop by default: proposed -> accepted/rejected -> executed.
CREATE TABLE IF NOT EXISTS yucer_agent.agent_action (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  session_id    UUID,
  action_type   VARCHAR(64) NOT NULL,                 -- e.g. advance_stage, draft_email
  subject_type  VARCHAR(32) NOT NULL
                  CONSTRAINT chk_agent_action_subject
                  CHECK (subject_type IN ('account', 'lead', 'opportunity', 'project', 'campaign', 'plan')),
  subject_id    UUID NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale     TEXT,
  confidence    SMALLINT,                             -- 0-100
  status        VARCHAR(32) NOT NULL DEFAULT 'proposed'
                  CONSTRAINT chk_agent_action_status
                  CHECK (status IN ('proposed', 'accepted', 'rejected', 'executed', 'failed', 'expired')),
  decided_by_sub VARCHAR(128),                        -- [ref] the human in the loop
  decided_at    TIMESTAMPTZ,
  executed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_agent_action_confidence CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 100)),
  CONSTRAINT fk_agent_action_session FOREIGN KEY (session_id) REFERENCES yucer_agent.agent_session (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_action_ws_status ON yucer_agent.agent_action (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_action_subject ON yucer_agent.agent_action (workspace_id, subject_type, subject_id);

-- Reusable sales play / talk track the copilot grounds its suggestions on.
CREATE TABLE IF NOT EXISTS yucer_agent.agent_playbook (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  playbook_code VARCHAR(64) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(255) NOT NULL,
  scope_domain  VARCHAR(32) NOT NULL
                  CONSTRAINT chk_agent_playbook_domain
                  CHECK (scope_domain IN ('strategy', 'planning', 'campaign', 'account', 'signal', 'pipeline', 'delivery', 'copilot')),
  trigger       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- when this play applies
  content       TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  status        VARCHAR(32) NOT NULL DEFAULT 'draft'
                  CONSTRAINT chk_agent_playbook_status CHECK (status IN ('draft', 'active', 'retired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_agent_playbook_version CHECK (version > 0),
  CONSTRAINT uidx_agent_playbook_ws_code UNIQUE (workspace_id, playbook_code)
);
