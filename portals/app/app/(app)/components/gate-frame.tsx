"use client";

import type { ReactNode } from "react";
import { PublicPageFrame } from "./public-page-frame";
import styles from "./public-page.module.css";

export type GateWidth = "narrow" | "wide";

/** All public states share the same chrome, ambience and introduction. */
export function GateFrame({ ariaLabel, width = "narrow", children }: {
  readonly ariaLabel: string;
  readonly width?: GateWidth;
  readonly children: ReactNode;
}) {
  return (
    <PublicPageFrame>
      <section aria-label={ariaLabel} className={`${styles.card} ${width === "wide" ? styles.wideGate : styles.gate}`}>
        {children}
      </section>
    </PublicPageFrame>
  );
}
