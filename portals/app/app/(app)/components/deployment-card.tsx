import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, Icon, Tooltip, TooltipContent, TooltipTrigger, type IconName } from "@vxture/design-ui";
import styles from "./deployment-card.module.css";
import links from "./business-reference.module.css";

/** Domain composition only: DS card surfaces, typography and spacing stay authoritative. */
export function DeploymentCard({ title, icon, tags, meta, actions, children, footer, href, onOpen, disabled }: {
  readonly title: ReactNode; readonly icon?: IconName; readonly tags?: ReactNode;
  readonly meta?: ReactNode; readonly actions?: ReactNode; readonly children: ReactNode; readonly footer?: ReactNode;
  readonly href?: string; readonly onOpen?: () => void; readonly disabled?: boolean;
}) {
  const identity = <>{icon ? <Icon name={icon} size="sm" className={styles.emblem}/> : null}<span className="min-w-0 break-words">{title}</span></>;
  let heading = <span className={styles.identity}>{identity}</span>;
  if (href) heading = <Link href={href} className={`${styles.identity} ${links.link}`}>{identity}</Link>;
  else if (onOpen) heading = <button type="button" data-control-kind="structural" disabled={disabled} onClick={onOpen} className={`${styles.identity} ${links.link} ${links.titleButton} text-left`}>{identity}</button>;
  return <Card className={styles.card} data-deployment-card>
    <CardContent className={styles.content}>
      <div className={styles.header}>
        <div className="flex min-w-0 flex-col gap-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-sm">
            <h3 className="flex min-w-0 text-body font-semibold">{heading}</h3>{tags}
          </div>
          {meta ? <div className={`${icon ? styles.indent : ""} flex min-w-0 flex-wrap items-center gap-x-md gap-y-xs text-body-small text-muted-foreground`}>{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-sm">{actions}</div> : null}
      </div>
      <div data-deployment-card-body className={`${styles.body} ${icon ? styles.indent : ""}`}>{children}</div>
      {footer ? <div className={`${styles.footer} ${icon ? styles.indent : ""}`}>{footer}</div> : null}
    </CardContent>
  </Card>;
}

export function DeploymentField({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }) {
  return <div className={styles.field}><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0">{children}</dd></div>;
}

export function DeploymentMetrics({ items }: { readonly items: readonly { readonly label: string; readonly value: ReactNode; readonly primary?: boolean; readonly hint?: string }[] }) {
  return <dl className={styles.metrics} data-deployment-metrics>
    {items.map(item => <div key={item.label}>
      <dt className="text-body text-muted-foreground">{item.label}</dt>
      <dd className={`min-w-0 text-body font-medium tabular-nums ${item.primary ? "text-primary-text" : "text-foreground"}`}>
        {item.hint ? <Tooltip><TooltipTrigger type="button" data-control-size="preserve" className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-xs text-left">{item.value}</TooltipTrigger><TooltipContent className={styles.tooltip}>{item.hint}</TooltipContent></Tooltip> : item.value}
      </dd>
    </div>)}
  </dl>;
}
