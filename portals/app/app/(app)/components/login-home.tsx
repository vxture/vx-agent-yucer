"use client";

import { Button, Icon } from "@vxture/design-ui";
import { ShellHeaderTools } from "@vxture/design-system";
import { BRAND_MARK_SRC, PRODUCT_MARK_SRC } from "../lib/brand-assets";
import { useMessages } from "../lib/i18n/provider";
import { useHeaderToolConfig } from "../lib/header-tool-config";
import { TOOLBOX_ON_LADDER } from "./header-ladder";
import styles from "./login-home.module.css";

/** Ruyin family public entry; authentication stays in the shared login route. */
export function LoginHome({ href, resume }: { readonly href: string; readonly resume: boolean }) {
  const { SIGNIN_TEXT: t, SHELL_TEXT, HEADER_TEXT } = useMessages();
  const tools = useHeaderToolConfig();
  return (
    <div id="login-home" className={styles.root}>
      <SpatialBackdrop />
      <header className={styles.header}>
        <div className={styles.chrome}>
          <a href="/" className={styles.brand} aria-label={`Ruyin ${SHELL_TEXT.brandMark}`}>
            <span className={styles.brandPart}><img src={BRAND_MARK_SRC} width={24} height={24} alt="" /><span className={styles.wordmark}>Ruyin</span></span>
            <span className={styles.divider} aria-hidden="true" />
            <span className={styles.brandPart}><img src={PRODUCT_MARK_SRC} width={28} height={28} alt="" /><span>{SHELL_TEXT.brandMark}</span></span>
          </a>
          <div className={styles.tools}>
            <ShellHeaderTools className={TOOLBOX_ON_LADDER} label={HEADER_TEXT.prefTitle} theme={tools.theme} locale={tools.locale} fullscreen={{ enterLabel: HEADER_TEXT.fullscreen, exitLabel: HEADER_TEXT.fullscreenExit, targetId: "login-home" }} />
            <Button asChild variant="ghost" size="icon-xl" className={styles.homeButton}>
              <a href="https://ruyin.work" aria-label={SHELL_TEXT.website}><Icon name="home" size={16} /></a>
            </Button>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.inner}>
          <p className={styles.eyebrow}>{t.eyebrow}</p>
          <section className={styles.card} aria-label={t.ariaLabel}>
            <div className={styles.heading}><p>{t.welcome}</p><h1>{t.productTitle}</h1></div>
            <div className={styles.actions}>
              <div className={styles.account}><Icon name="user" size={24} /><div><strong>{t.accountTitle}</strong><p>{t.accountDescription}</p></div></div>
              {resume ? <p role="status" className={styles.resuming}>{t.resuming}</p> : <Button asChild className={styles.cta}><a href={href}>{t.continueLabel}<Icon name="arrow-right" size={16} /></a></Button>}
            </div>
            <p className={styles.security}><Icon name="shield-check" size={16} />{t.security}</p>
          </section>
          <div className={styles.message}><p>{t.tagline}</p><p>{t.taglineEnglish}</p></div>
        </div>
      </main>
      <footer className={styles.footer}><div className={styles.chrome}>
        <p>{"\u00a9 2026 VXTURE \u00b7 RUYIN"}</p>
        <nav aria-label={t.terms}>{([ ["terms", t.terms], ["privacy", t.privacy], ["copyright", t.copyright] ] as const).map(([path, label]) => <a key={path} href={`https://vxture.com/zh-CN/legal/${path}`}>{label}</a>)}</nav>
      </div></footer>
    </div>
  );
}

/** Decorative vector scene: semantic DS colors and no downloaded bitmap. */
function SpatialBackdrop() {
  return <div className={styles.backdrop} aria-hidden="true">
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="login-grid" width="100" height="58" patternUnits="userSpaceOnUse"><path d="M0 29 50 0 100 29 50 58Z" fill="none" stroke="currentColor" strokeWidth=".6" /></pattern>
        <g id="login-building"><path d="M0 0 70-40 140 0 70 40Z" fill="currentColor" fillOpacity=".035"/><path d="M0 0V100L70 140 140 100V0M70 40V140M0 100 70 60 140 100"/><path d="M16 24v52m18-42v52m18-42v52m36-52v52m18-62v52m18-62v52" strokeOpacity=".45" /></g>
        <g id="login-device"><path d="m0 0 32-18 32 18v44L32 62 0 44Zm0 0 32 18L64 0M32 18v44"/><path d="m10 0 22-12L54 0 32 12Z" fill="currentColor" fillOpacity=".07"/></g>
      </defs>
      <g className={styles.scene}>
        <path d="M-200 340H1800V1150H-200Z" fill="url(#login-grid)" stroke="none" opacity=".35" />
        <path d="m-100 760 760-440 1020 590M-100 820 660 380 1680 970M120 1060 760 690 1500 260M180 1100 820 730 1560 300" strokeWidth="2" opacity=".45" />
        <use href="#login-building" transform="translate(100 380) scale(1.4)"/><use href="#login-building" transform="translate(340 250) scale(.9)"/><use href="#login-building" transform="translate(1170 320) scale(1.5)"/><use href="#login-building" transform="translate(1390 560) scale(.85)"/><use href="#login-building" transform="translate(290 730) scale(1.15)"/><use href="#login-building" transform="translate(1030 800) scale(.8)"/>
        <use href="#login-device" transform="translate(500 550)"/><use href="#login-device" transform="translate(1080 600)"/><use href="#login-device" transform="translate(190 660)"/><use href="#login-device" transform="translate(1380 810)"/>
        <path className={styles.route} d="m-80 620 420 244 730-422 580 336M220 220l800 464 520-300" />
        {[ [340,864], [1070,442], [1020,684], [520,550], [1110,600] ].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="currentColor" />)}
      </g>
    </svg>
  </div>;
}
