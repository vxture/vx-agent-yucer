"use client";
import type { ReactNode } from "react";
import { PublicPageFrame } from "./public-page-frame";
import styles from "./public-page.module.css";
/** The same narrow public card for every non-business state. */
export function GateFrame({ ariaLabel, children }: { readonly ariaLabel: string; readonly children: ReactNode }) {
  return <PublicPageFrame><section aria-label={ariaLabel} className={styles.card}>{children}</section></PublicPageFrame>;
}
