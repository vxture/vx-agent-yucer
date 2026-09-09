import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { forecastThresholds } from "../../../domains/pipeline/service";
import { ForecastThresholdConfig } from "../../components/forecast-threshold-config";
import { saveForecastThresholds } from "../../pipeline/threshold-actions";
import { loadFailureText } from "../../lib/load-failure";

// 预测阈值 - 业务参数, one item in 配置管理 (incr/0041).
//
// WHY IT LIVES HERE AND NOT ON /forecast. The numbers are configuration - set
// once, read by every suggestion afterwards - and 预测口径 is where a person
// works through the deals themselves. Reading them needs the same gate that
// page does; changing them needs the permission that re-files a category.

export const dynamic = "force-dynamic";

export default async function ForecastThresholdPage() {
  const { ADMIN_TEXT, FORECAST_PARAM_TEXT, LOAD_ERROR, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
  if (!can(session.authz, session.entitlement, "pipeline.forecast.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const thresholds = await forecastThresholds(ctx);
  if (!thresholds.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(thresholds.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={FORECAST_PARAM_TEXT.title}
      />
      <ForecastThresholdConfig
        thresholds={thresholds.value}
        canWrite={
          can(session.authz, session.entitlement, "pipeline.forecast.categorize", "ui").allowed
        }
        onSave={saveForecastThresholds}
      />
    </ViewLayout>
  );
}
