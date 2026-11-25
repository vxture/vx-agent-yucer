import { createHash } from "node:crypto";
import { getPrismaClient, prismaEnabled } from "../../lib/db";

// Only MVCC metadata crosses this adapter, never record contents. A change in
// any rule dependency invalidates the private derived feed. Scope and member
// authorization are independently rechecked by topic-service on every read.
export async function readJudgementRevision(workspaceId: string): Promise<string | null> {
  if (!prismaEnabled()) return null;
  const p = await getPrismaClient();
  // Fixed SQL identifiers and one parameterized workspace. This statement
  // observes one consistent PostgreSQL snapshot and returns metadata only.
  const rows = await p.$queryRaw<{ dependency: number; count: string; version: string }[]>`
    WITH scope AS (SELECT ${workspaceId}::uuid AS workspace_id)
    SELECT 0 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_core.account WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 1 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_core.person WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 2 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_core.person_affiliation WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 3 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_core.account_relation WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 4 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_core.account_collaborator WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 5 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_core.account_plan WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 6 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_field.interaction WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 7 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_field.interaction_participant WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 8 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_field.commitment WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 9 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_field.contact_recency_policy WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 10 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_pipeline.opportunity WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 11 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_pipeline.opportunity_contact WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 12 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_pipeline.opportunity_stage_event WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 13 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_pipeline.stage_definition WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 14 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_pipeline.forecast_snapshot WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 15 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_gtm.sales_target WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 16 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_gtm.sales_plan WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 17 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_gtm.sales_plan_revision WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 18 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_gtm.sales_plan_event WHERE workspace_id = (SELECT workspace_id FROM scope)
    UNION ALL
    SELECT 19 AS dependency, count(*)::text AS count,
      COALESCE(sum(hashtextextended(ctid::text || '/' || xmin::text, 0)::numeric), 0)::text AS version
      FROM yucer_gtm.sales_plan_legacy_target WHERE workspace_id = (SELECT workspace_id FROM scope)
    ORDER BY dependency`;
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
