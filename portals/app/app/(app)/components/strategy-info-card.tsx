"use client";

import type { ComponentProps } from "react";
import { Card, CardContent } from "@vxture/design-ui";
import styles from "./strategy-info-card.module.css";

/** Domain layouts composed from DS cards; all spacing follows DS density. */
export function StrategyInfoCard({ variant = "detail", className = "", ...props }: ComponentProps<typeof Card> & {
  readonly variant?: "overview" | "detail" | "reference";
}) {
  return <Card {...props} data-strategy-card-kind={variant} className={`${styles.card} ${styles[variant]} ${className}`} />;
}

export function StrategyInfoContent({ className = "", ...props }: ComponentProps<typeof CardContent>) {
  return <CardContent {...props} className={`${styles.content} ${className}`} />;
}
