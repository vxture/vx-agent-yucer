"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Icon } from "@vxture/design-system";
import { useLocale } from "../lib/i18n/provider";
import styles from "./workspace.module.css";

export function AttainmentPageFrame({
  children,
  fitted = false,
}: {
  children: ReactNode;
  fitted?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const params = useSearchParams();
  const identity = `${params.get("screen") ?? ""}|${params.get("scope") ?? ""}`;
  const [guidance, setGuidance] = useState<"none" | "more" | "end">("none");
  const [cueLeft, setCueLeft] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | undefined>();
  const locale = useLocale();
  useEffect(() => {
    const scroll = content.current?.closest<HTMLElement>(
      '[data-workspace-scroll="content"]',
    );
    if (!scroll) return;
    const top = () => {
      scroll.scrollTo({ top: 0, behavior: "instant" });
    };
    top();
    window.addEventListener("yucer:attainment-navigation", top);
    return () => window.removeEventListener("yucer:attainment-navigation", top);
  }, [identity]);
  useEffect(() => {
    const node = content.current,
      scroll = node?.closest<HTMLElement>('[data-workspace-scroll="content"]');
    if (!node || !scroll) return;
    const measure = () => {
      const bounds = scroll.getBoundingClientRect();
      setCueLeft((Math.max(0, bounds.left) + Math.min(window.innerWidth, bounds.right)) / 2);
      if (fitted) {
        const containerStyle = getComputedStyle(node.parentElement!.parentElement!);
        setViewportHeight(Math.max(0, scroll.clientHeight -
          parseFloat(containerStyle.paddingTop) - parseFloat(containerStyle.paddingBottom)));
      }
      const dialog = !!document.querySelector(
        '[role="dialog"][data-state="open"]',
      );
      const needed = scroll.scrollHeight > scroll.clientHeight + 2;
      setGuidance(
        !needed || dialog
          ? "none"
          : scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 2
            ? "end"
            : "more",
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(scroll);
    const mutation = new MutationObserver(measure);
    mutation.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    scroll.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      mutation.disconnect();
      scroll.removeEventListener("scroll", measure);
    };
  }, [fitted]);
  return (
    <div className={styles.page} data-attainment-fitted={fitted}
      style={fitted ? { minHeight: viewportHeight } : undefined}>
      <div ref={content} className="flex min-w-0 flex-col gap-xl"
        style={fitted ? { minHeight: viewportHeight } : undefined}>
        {children}
      </div>
      {guidance !== "none" && cueLeft !== null && createPortal(
        <div className={styles.scrollCue} style={{ left: cueLeft }}
          role="status" aria-live="polite" aria-atomic="true">
          {guidance === "more" ? (
            <>
              <Icon name="caret-double-down" size="sm" aria-hidden="true" />
              <span className="sr-only">
                {locale.startsWith("zh")
                  ? "\u4e0b\u65b9\u8fd8\u6709\u5185\u5bb9"
                  : "More content below"}
              </span>
            </>
          ) : (
            <span>
              {locale.startsWith("zh")
                ? "\u2014 \u5df2\u5230\u9875\u9762\u5e95\u90e8 \u2014"
                : "\u2014 End of page \u2014"}
            </span>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
