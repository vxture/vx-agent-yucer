"use client";

import { ArrowsInSimple, ArrowsOutSimple } from "@phosphor-icons/react";
import { ShellLocaleSwitcher, ShellThemeToggle, useTheme } from "@vxture/design-system";
import { Button, Icon, useFullscreen } from "@vxture/design-ui";
import { useHeaderToolConfig } from "../lib/header-tool-config";
import { useMessages } from "../lib/i18n/provider";
import styles from "./public-page.module.css";

/** Public-family tools use target-theme and diagonal fullscreen icons. */
export function PublicHeaderTools() {
  const tools = useHeaderToolConfig();
  const { theme } = useTheme();
  const { HEADER_TEXT, SHELL_TEXT } = useMessages();
  const { isTargetFullscreen, toggle } = useFullscreen();
  const active = isTargetFullscreen("public-page-root");
  const FullscreenIcon = active ? ArrowsInSimple : ArrowsOutSimple;
  return (
    <div className={styles.tools} role="group" aria-label={HEADER_TEXT.prefTitle}>
      <ShellThemeToggle currentTheme={theme} onThemeChange={tools.theme.onChange}
        lightLabel={tools.theme.toLightLabel} darkLabel={tools.theme.toDarkLabel}
        className={styles.toolButton} />
      <ShellLocaleSwitcher currentLocale={tools.locale.current} options={tools.locale.options}
        onLocaleChange={tools.locale.onChange} buttonLabel={tools.locale.label}
        panelLabel={tools.locale.panelLabel} buttonClassName={styles.toolButton} />
      <Button variant="ghost" size="icon-xl" className={styles.toolButton}
        aria-label={active ? HEADER_TEXT.fullscreenExit : HEADER_TEXT.fullscreen}
        aria-pressed={active}
        onClick={() => toggle("public-page-root", document.documentElement, { mode: "native" })}>
        <FullscreenIcon size={16} weight="regular" aria-hidden="true" />
      </Button>
      <Button asChild variant="ghost" size="icon-xl" className={styles.toolButton}>
        <a href="https://ruyin.work" aria-label={SHELL_TEXT.website}><Icon name="home" size={16} /></a>
      </Button>
    </div>
  );
}
