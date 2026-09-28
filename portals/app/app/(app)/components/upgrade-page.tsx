"use client";

import { Button, Card, Icon, SectionHeader, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type { UpgradeTarget } from "../lib/upgrade";
import { ModuleHeadline } from "./module-headline";
import { Tag } from "./tag";

// 高级功能升级页 (owner 2026-09-28) - ONE template for every module this
// workspace has not bought, in the centre pane; the board and the deck stay.
//
//   标题区   the module's own headline (same icon and name as the launcher),
//            a lock tag with the tier, one line on what it is for;
//   功能定位  three capabilities, and the 参谋 that comes with it if any;
//   档位条    current tier -> required tier, what else that tier brings, and
//            【升级】 - the ONLY way to the subscription page.
//
// No preview of the page (owner: 去掉「长这样」), and never this workspace's
// data: that would hand a lower tier what a higher tier reads.

export function UpgradePage({ target, pricingHref }: { readonly target: UpgradeTarget; readonly pricingHref: string }) {
  const { UPGRADE_TEXT: T, TIER_LABEL } = useMessages();
  const tier = (t: string) => TIER_LABEL[t] ?? t;
  const copy = T.module[target.key];
  const required = tier(target.requiredTier);
  const also = [...target.viaTiers.map((t) => T.allOf(tier(t))), ...target.alsoUnlocks.map((f) => T.feature[f] ?? f)];

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey={target.key}
        description={copy?.pitch ?? ""}
        tags={
          <Tag tone="warning" icon="lock">
            {T.badge(required)}
          </Tag>
        }
      />

      {copy ? (
        <Card className="p-lg flex flex-col gap-md">
          <SectionHeader level={3} title={T.positioning} />
          <div className="grid grid-cols-1 gap-md md:grid-cols-3">
            {copy.points.map((p) => (
              <div key={p.title} className="border-border flex flex-col gap-xs rounded-md border p-md">
                <span className="text-foreground text-body font-medium">{p.title}</span>
                <span className="text-muted-foreground text-body-sm leading-relaxed">{p.body}</span>
              </div>
            ))}
          </div>
          {copy.advisor ? (
            <p className="bg-muted/40 text-body-sm flex items-start gap-xs rounded-md px-md py-sm">
              <Icon name="sparkles" size="sm" className="text-primary mt-3xs shrink-0" />
              <span>
                <span className="text-foreground font-medium">
                  {T.advisorLead}
                  {copy.advisor.name}
                </span>
                <span className="text-muted-foreground">{T.sep}{copy.advisor.body}</span>
              </span>
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* The DS Card is a column; the row lives inside it - text left,
          【升级】 right, wrapping under on a narrow pane. */}
      <Card className="border-primary/30 bg-primary/5 p-lg">
        <div className="flex w-full flex-wrap items-center gap-lg">
          <div className="flex min-w-0 grow flex-col gap-xs">
            <span className="text-body flex flex-wrap items-center gap-xs">
              <span className="text-muted-foreground">{T.current}</span>
              <Tag>{target.currentTier ? tier(target.currentTier) : T.noTier}</Tag>
              <Icon name="arrow-right" size="xs" className="text-muted-foreground" />
              <span className="text-muted-foreground">{T.need}</span>
              <StatusBadge tone="info" icon={false}>
                {required}
              </StatusBadge>
            </span>
            <span className="text-muted-foreground text-body-sm">
              {also.length > 0 ? `${T.alsoUnlocks(required)}${also.join(T.sep)}` : T.onlyThis(required)}
            </span>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <a href={pricingHref} target="_blank" rel="noopener noreferrer">
              {T.upgrade}
              <Icon name="external-link" size="sm" />
            </a>
          </Button>
        </div>
      </Card>
    </ViewLayout>
  );
}
