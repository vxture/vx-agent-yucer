"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { ShellSearchBox } from "@vxture/design-system";
import { Kbd } from "@vxture/design-ui";
import styles from "./header-controls.module.css";

/** Keep DS search and key handling, while separating the displayed key names. */
export function HeaderSearch(props: ComponentProps<typeof ShellSearchBox>) {
  const [modifier, setModifier] = useState("Ctrl");
  useEffect(() => {
    setModifier(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent) ? "\u2318" : "Ctrl");
  }, []);
  const key = props.shortcutKey === undefined ? "k" : props.shortcutKey;
  return (
    <div className={styles.search}>
      <ShellSearchBox {...props} />
      {key && !props.query ? (
        <Kbd className={styles.shortcut}>{modifier} + {key.toUpperCase()}</Kbd>
      ) : null}
    </div>
  );
}
