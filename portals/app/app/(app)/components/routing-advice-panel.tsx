"use client";

import type { RoutingAdvice } from "../../domains/signal/lib/routing-advice";
import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// 分派检查 - the routing page's half of the dock, on the one assistant surface
// (assistant.tsx owns the shape).
//
// NO ACTS HERE, AND THAT IS THE POINT. Every finding on this panel is either a
// pile of decisions somebody must take one at a time - which is what the apply
// column beside it is for - or a piece of missing configuration that lives on
// another page entirely. An "assign them all" button would be a batch wearing
// a batch's costume: the owner of a lead is who gets asked about it.
//
// EACH FINDING LINKS TO WHERE IT IS FIXED, because a router's findings are
// almost never fixed on the router's page. A missing region is the account
// record; an uncovered region or an ownerless one is the territory map.

export function RoutingAdvicePanel({
  advice,
  total,
}: {
  readonly advice: readonly RoutingAdvice[];
  /** How many open leads the check looked at. */
  readonly total: number;
}) {
  const { ROUTING_TEXT } = useMessages();

  const text = (a: RoutingAdvice) => {
    switch (a.kind) {
      case "pending_assignments":
        return ROUTING_TEXT.advicePending(a.count);
      case "no_region":
        return ROUTING_TEXT.adviceNoRegion(a.count);
      case "no_territory":
        return ROUTING_TEXT.adviceNoTerritory(a.count);
      case "no_owner":
        return ROUTING_TEXT.adviceNoOwner(a.count);
      case "load_imbalance":
        return ROUTING_TEXT.adviceImbalance(a.sub ?? "", a.count, a.share ?? 0);
    }
  };

  // THE MAP'S HOLES OUTRANK THE QUEUE. Leads waiting on a click are work that
  // is already decided; leads nobody can place are work that cannot start, and
  // they stay broken until somebody edits a different page.
  const tone = (a: RoutingAdvice): AssistantItem["tone"] =>
    a.kind === "pending_assignments" ? "info" : a.kind === "load_imbalance" ? "warn" : "danger";

  const link = (a: RoutingAdvice) =>
    a.kind === "no_region"
      ? { label: ROUTING_TEXT.adviceOpenAccounts, href: "/account" }
      : a.kind === "no_territory" || a.kind === "no_owner"
        ? { label: ROUTING_TEXT.adviceOpenTerritory, href: "/territory" }
        : { label: ROUTING_TEXT.adviceOpenRouting, href: "/routing" };

  const items: AssistantItem[] = advice.map((a) => ({
    id: a.id,
    text: text(a),
    tone: tone(a),
    link: link(a),
  }));

  return (
    <AssistantSection
      section={{
        id: "routing-advice",
        title: ROUTING_TEXT.adviceTitle,
        scope: ROUTING_TEXT.adviceScope(total),
        items,
        empty: ROUTING_TEXT.adviceClear,
      }}
    />
  );
}
