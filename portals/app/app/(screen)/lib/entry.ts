import type { ActionId } from "../../authz/actions";

/* 板块直达 - where each of the six cards goes, and what that page costs.
 *
 * KEPT AS DATA rather than written inline at the six call sites, so the guard
 * beside it can check every destination against the navigation catalogue. The
 * failure it protects against is silent: a link is gated on one action while
 * the page behind it enforces another, so the button appears and the page then
 * refuses - which is worse than no button, because the reader has been told
 * they may go somewhere they may not.
 */
/** The six cards, and the single place their keys are written down. */
export type EntryKey =
  | "leads" | "pipeline" | "contract" | "copilot" | "delivery" | "collection";

export interface EntryTarget {
  readonly key: EntryKey;
  readonly href: string;
  /** The DESTINATION's own view action - never this screen's. */
  readonly action: ActionId;
}

export const ENTRY_TARGETS: readonly EntryTarget[] = [
  { key: "leads", href: "/lead", action: "signal.lead.view" },
  { key: "pipeline", href: "/pipeline", action: "pipeline.view" },
  /* 承诺达成. 签约合同's lead figure is signed value, and this is the page that
     reads signed value against what was committed. /pipeline would land the
     reader on the same list 商机储备 already offers. */
  { key: "contract", href: "/attainment", action: "pipeline.view" },
  /* The plays, not the queue: /copilot is gated on copilot.playbook.view,
     while this screen only ever asked for copilot.action.view. */
  { key: "copilot", href: "/copilot", action: "copilot.playbook.view" },
  { key: "delivery", href: "/delivery", action: "delivery.project.view" },
  /* The money, not the project. /collection needs delivery.revenue.view, which
     is NOT among the five gates this screen requires - the instalments reach it
     through the project view instead. */
  { key: "collection", href: "/collection", action: "delivery.revenue.view" },
];
