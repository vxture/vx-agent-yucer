"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@vxture/design-ui";
import { LOCALE_CONSTANTS, SUPPORTED_LOCALES, type Locale } from "@vxture/shared";
import { useLocale, useMessages } from "../../(app)/lib/i18n/provider";

/* 右上角的三个控件 - fullscreen, language, settings.
 *
 * They live beside the viewer block because that corner is where a reader
 * looks for "things about my session" rather than "things about the numbers".
 * None of them touches the data.
 */

export function ScreenTools() {
  const { SCREEN_TEXT } = useMessages();
  const locale = useLocale();
  const [isFull, setIsFull] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  /* THE BROWSER OWNS THIS STATE, so it is read from the browser rather than
     remembered here. Escape and F11 both leave fullscreen without going
     through the button, and a local boolean would then show the wrong icon
     with no way back to the truth. */
  useEffect(() => {
    const sync = () => setIsFull(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFull = () => {
    // Requests can be refused - a permissions policy, or an iframe without
    // allow="fullscreen" - and an unhandled rejection in that case is a
    // console error for a button that simply did not apply.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  /* Two locales, so this is a TOGGLE and not a menu: a dropdown to choose
     between two things is a click more than the choice is worth. Written to
     the platform's own cookie - the same one resolveLocale reads - and then a
     full reload, because the copy is resolved on the server and half of it is
     already in the HTML. */
  const other = (SUPPORTED_LOCALES.find((l) => l !== locale) ?? locale) as Locale;
  const switchLocale = () => {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie =
      `${LOCALE_CONSTANTS.COOKIE_KEY}=${other}; path=/; max-age=${oneYear}; samesite=lax`;
    window.location.reload();
  };

  return (
    <div className="tools" ref={holder}>
      <button
        type="button"
        className="tool"
        onClick={toggleFull}
        aria-pressed={isFull}
        title={isFull ? SCREEN_TEXT.exitFullscreen : SCREEN_TEXT.enterFullscreen}
        aria-label={isFull ? SCREEN_TEXT.exitFullscreen : SCREEN_TEXT.enterFullscreen}
      >
        <Icon name={isFull ? "minimize" : "maximize"} />
      </button>

      <button
        type="button"
        className="tool"
        onClick={switchLocale}
        title={SCREEN_TEXT.switchLocale(other)}
        aria-label={SCREEN_TEXT.switchLocale(other)}
      >
        <Icon name="globe" />
      </button>

      {/* A PLACEHOLDER, AND IT SAYS SO. `disabled` is the DS's third row state
          and its documented meaning is exactly this one: the feature is here,
          it just is not available. A live button that silently did nothing
          would be the dishonest version. */}
      <button
        type="button"
        className="tool"
        disabled
        title={SCREEN_TEXT.settingsSoon}
        aria-label={SCREEN_TEXT.settingsSoon}
      >
        <Icon name="settings" />
      </button>
    </div>
  );
}
