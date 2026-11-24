"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { ShellPageContainer, ShellSidebarFrame } from "@vxture/design-ui";
import type { ContentWidth } from "../lib/content-width";
import styles from "./workspace-insets.module.css";
import { useDockSize } from "./use-dock-size";

const Context = createContext<{ readonly width: ContentWidth; readonly leftOpen: boolean } | null>(null);

export function WorkspaceLayoutProvider({ width, leftOpen, children }: {
  readonly width: ContentWidth;
  readonly leftOpen: boolean;
  readonly children: ReactNode;
}) {
  return <Context.Provider value={{ width, leftOpen }}>{children}</Context.Provider>;
}

function useWorkspaceLayout() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceLayoutProvider is required");
  return value;
}

/** One DS container for lists, forms, details and administration.
 * The permanent top clearance sits OUTSIDE the scrolling viewport.
 * A canvas owns its internal scroll regions and end clearance instead.
 */
export function WorkspaceContent({ children, canvas = false }: {
  readonly children: ReactNode;
  readonly canvas?: boolean;
}) {
  const { width } = useWorkspaceLayout();
  return <div className={styles.contentPane} data-workspace-content={canvas ? "canvas" : "page"}>
    <div className={canvas ? styles.canvasViewport : styles.contentScroll} data-workspace-scroll={canvas ? undefined : "content"}>
      <ShellPageContainer width={width === "wide" ? "ultra-3xl" : "wide-2xl"}
        className={`${styles.contentContainer} ${canvas ? styles.canvasContainer : ""}`}>
        {children}
      </ShellPageContainer>
    </div>
  </div>;
}

/** Dossiers use the compact DS sidebar width. Navigation has its own frame.
 * Hiding a pane preserves local editors, scroll state and unsaved changes.
 */
export function WorkspaceSidebar({ children }: { readonly children: ReactNode }) {
  const { leftOpen } = useWorkspaceLayout();
  const frame = useRef<HTMLDivElement>(null);
  useDockSize(frame);
  return <div ref={frame} role="complementary" className={styles.leftPane} aria-hidden={!leftOpen} inert={!leftOpen} data-workspace-left data-pane-open={leftOpen}>
    <ShellSidebarFrame mode="expanded" className={styles.leftDock}>
      <div className={styles.leftScroll} data-workspace-scroll="left">{children}</div>
    </ShellSidebarFrame>
  </div>;
}
