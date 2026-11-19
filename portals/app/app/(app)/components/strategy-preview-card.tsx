"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Button, Card, Drawer } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { collectionDrawerWidth } from "./collection-layout";
import styles from "./strategy-detail-reading.module.css";

/** A card's preview action and its title/navigation links are separate targets. */
export function StrategyPreviewCard({ title, detail, children, className = "", ...props }: Omit<ComponentProps<typeof Card>, "title"> & {
  readonly title: string;
  readonly detail: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { STRATEGY_DETAIL_TEXT:D, MARKET_STRATEGY_TEXT:T } = useMessages();
  return <>
    <Card {...props} className={`${styles.previewCard} ${className}`}>
      <Button type="button" variant="ghost" size="md" className={styles.previewTrigger} data-control-size="preserve"
        aria-label={`${D.preview} ${title}`} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}><span className="sr-only">{D.preview} {title}</span></Button>
      {children}
    </Card>
    <Drawer open={open} onClose={() => setOpen(false)} width={collectionDrawerWidth.standard}
      title={title} closeLabel={T.closed} className="max-w-full">
      <div className="flex min-w-0 flex-col gap-lg pb-lg text-sm" data-strategy-card-preview>{detail}</div>
    </Drawer>
  </>;
}
