"use client";
import Link from "next/link";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useSearchParams } from "next/navigation";
import { ShellSidebarNav } from "@vxture/design-system";
import { useLocale } from "../lib/i18n/provider";
import {
  attainmentPageHref,
  attainmentScreen,
  type AttainmentScreen,
} from "../lib/attainment-pages";

export type AttainmentNavData = {
  regions: readonly { id: string; name: string }[];
  workspace: boolean;
  canForecast: boolean;
};
export const AttainmentNavContext = createContext<Dispatch<
  SetStateAction<AttainmentNavData | null>
> | null>(null);
export function AttainmentNavRegistration({
  data,
}: {
  data: AttainmentNavData;
}) {
  const set = useContext(AttainmentNavContext);
  const serialized = JSON.stringify(data);
  useEffect(() => {
    set?.(JSON.parse(serialized) as AttainmentNavData);
  }, [set, serialized]);
  return null;
}
/** Native anchors retain modifier/new-tab behavior; only in-app navigation resets. */
const NavigationLink = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof Link>
>(function NavigationLink({ onClick, ...props }, ref) {
  return (
    <Link
      {...props}
      ref={ref}
      scroll={false}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey
        )
          window.dispatchEvent(new Event("yucer:attainment-navigation"));
      }}
    />
  );
});
export function AttainmentNav({
  data,
  collapsed,
  onToggleCollapsed,
}: {
  data: AttainmentNavData | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const params = useSearchParams();
  const locale = useLocale();
  const zh = locale.startsWith("zh");
  const period = params.get("period") ?? `Y${new Date().getUTCFullYear()}`;
  const screen = attainmentScreen(Object.fromEntries(params));
  const scope =
    params.get("scope") ?? (data?.workspace ? "workspace" : "personal");
  const item = (
    page: AttainmentScreen,
    label: string,
    icon: ComponentProps<
      typeof ShellSidebarNav
    >["sections"][number]["items"][number]["icon"],
    key = scope,
  ) => ({
    href: attainmentPageHref(page, period, key),
    label,
    icon,
  });
  const sections = [
    {
      title: zh ? "\u516c\u53f8\u76ee\u6807" : "Company goals",
      items: [
        ...(data?.workspace
          ? [
              item(
                "company",
                zh ? "\u516c\u53f8\u8fbe\u6210" : "Company attainment",
                "building",
                "workspace",
              ),
            ]
          : []),
        item(
          "customers",
          zh ? "\u5ba2\u6237\u8fbe\u6210" : "Customer attainment",
          "flag",
          data?.workspace ? "workspace" : scope,
        ),
      ],
    },
    {
      title: zh ? "\u533a\u57df\u76ee\u6807" : "Regional goals",
      items: [
        ...(data?.regions.length
          ? [
              item(
                "regions",
                zh ? "\u533a\u57df\u5bf9\u6bd4" : "Regional comparison",
                "chart-bar",
                data.workspace ? "workspace" : "team",
              ),
            ]
          : []),
        ...(data?.regions.map((r) =>
          item(
            "region",
            r.name,
            "map-pin",
            `territory:${r.id}`,
          ),
        ) ?? []),
      ],
    },
    {
      title: zh ? "\u56e2\u961f\u76ee\u6807" : "Team goals",
      items: [
        item(
          "team",
          zh ? "\u56e2\u961f\u8fbe\u6210" : "Team attainment",
          "users",
          data?.workspace ? "workspace" : "personal",
        ),
        item(
          "mine",
          zh ? "\u6211\u7684\u8fbe\u6210" : "My attainment",
          "user",
          "personal",
        ),
      ],
    },
    ...(data?.canForecast
      ? [
          {
            title: zh
              ? "\u9884\u6d4b\u548c\u5386\u53f2"
              : "Forecast and history",
            items: [
              item(
                "forecast",
                zh ? "\u9500\u552e\u9884\u6d4b" : "Sales forecast",
                "chart-line",
                scope === "team" ? "personal" : scope,
              ),
              item(
                "history",
                zh ? "\u9884\u6d4b\u8bb0\u5f55" : "Forecast records",
                "clock",
                scope === "team" ? "personal" : scope,
              ),
            ],
          },
        ]
      : []),
  ].filter((s) => s.items.length);
  return (
    <ShellSidebarNav
      sections={sections}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      labels={{
        expandNav: zh ? "\u5c55\u5f00\u5bfc\u822a" : "Expand navigation",
        collapseNav: zh ? "\u6536\u8d77\u5bfc\u822a" : "Collapse navigation",
        expandAllGroups: zh ? "\u5c55\u5f00\u5168\u90e8\u5206\u7ec4" : "Expand all groups",
        collapseAllGroups: zh ? "\u6536\u8d77\u5168\u90e8\u5206\u7ec4" : "Collapse all groups",
      }}
      linkComponent={NavigationLink}
      storageKeyPrefix="yucer.attainment"
      isActive={(href) => {
        const q = new URL(href, "https://local.invalid").searchParams;
        return (
          q.get("screen") === screen &&
          (screen !== "region" || q.get("scope") === scope)
        );
      }}
    />
  );
}
