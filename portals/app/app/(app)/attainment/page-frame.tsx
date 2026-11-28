"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Icon } from "@vxture/design-system";
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
      const dialog = !!document.querySelector(
        '[role="dialog"][data-state="open"]',
      );
      const needed = node.getBoundingClientRect().height > scroll.clientHeight;
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
    <div className={styles.page} data-attainment-fitted={fitted}>
      <div ref={content} className="flex min-w-0 flex-col gap-xl">
        {children}
      </div>
      <div className={styles.scrollCue} aria-live="polite">
        {guidance === "more" ? (
          <Button
            size="icon-md"
            variant="outline"
            aria-label={
              locale.startsWith("zh")
                ? "\u7ee7\u7eed\u5411\u4e0b\u9605\u8bfb"
                : "Continue reading"
            }
            onClick={() => {
              const scroll = content.current?.closest<HTMLElement>(
                '[data-workspace-scroll="content"]',
              );
              scroll?.scrollBy({
                top: scroll.clientHeight * 0.75,
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
            }}
          >
            <Icon name="caret-double-down" size="sm" />
          </Button>
        ) : guidance === "end" ? (
          <span className="rounded-full bg-background px-md py-xs text-body-small text-muted-foreground">
            {locale.startsWith("zh")
              ? "\u2014 \u5df2\u5230\u9875\u9762\u5e95\u90e8 \u2014"
              : "\u2014 End of page \u2014"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
