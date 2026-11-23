"use client";

import type { ReactNode } from "react";
import { BRAND_MARK_SRC, PRODUCT_MARK_SRC } from "../lib/brand-assets";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { GateAmbience } from "./gate-ambience";
import { PublicHeaderTools } from "./public-header-tools";
import styles from "./public-page.module.css";

/** One public shell for sign-in, recovery, signed-out and access gates. */
export function PublicPageFrame({ children }: { readonly children: ReactNode }) {
  const { SIGNIN_TEXT: t, SHELL_TEXT } = useMessages();
  const locale = useLocale();
  return (
    <div id="public-page-root" className={styles.root}>
      <div className={styles.backdrop} aria-hidden="true"><GateAmbience /></div>
      <header className={styles.header}>
        <div className={styles.chrome}>
          <div className={styles.brand}>
            <a href="https://ruyin.work" className={styles.brandPart} aria-label="Ruyin"><img src={BRAND_MARK_SRC} width={24} height={24} alt="" /><span className={styles.wordmark}>Ruyin</span></a>
            <span className={styles.divider} aria-hidden="true" />
            <a href="/" className={styles.brandPart} aria-label={SHELL_TEXT.brandMark}><img src={PRODUCT_MARK_SRC} width={28} height={28} alt="" /><span>{SHELL_TEXT.brandMark}</span></a>
          </div>
          <PublicHeaderTools />
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.inner}>
          <p className={styles.eyebrow}>{t.eyebrow}</p>
          {children}
          <div className={styles.message}><p>{t.tagline}</p><p>{t.taglineEnglish}</p></div>
        </div>
      </main>
      <footer className={styles.footer}><div className={styles.chrome}>
        <p>{"\u00a9 2026 VXTURE \u00b7 RUYIN"}</p>
        <nav aria-label={t.terms}>{([ ["terms", t.terms], ["privacy", t.privacy], ["copyright", t.copyright] ] as const).map(([path, label]) => <a key={path} href={`https://vxture.com/${locale}/legal/${path}`}>{label}</a>)}</nav>
      </div></footer>
    </div>
  );
}
