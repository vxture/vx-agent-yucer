"use client";

import type { SolutionAdvice } from "../../domains/catalog/lib/solution-advice";
import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// The solution module's contribution to the assistant - sentences and links,
// with the shape supplied by assistant.tsx.
//
// WHY THIS ONE LINKS RATHER THAN ACTS. A floor has an arithmetic answer, so
// the price book's items can carry one. Which products belong together and
// what gets tailored is a commercial judgement, and a machine offering to
// rewrite a bundle would be making it. What a machine can say is which
// templates would not survive being quoted - and then hand over.

export function SolutionAdvicePanel({ advice }: { readonly advice: readonly SolutionAdvice[] }) {
  const { CATALOG_TEXT } = useMessages();

  const text = (a: SolutionAdvice) => {
    switch (a.kind) {
      case "retired_product":
        return CATALOG_TEXT.solutionAdviceRetired(a.solutionName ?? "", a.productName ?? "");
      case "unpriced_product":
        return CATALOG_TEXT.solutionAdviceUnpriced(a.solutionName ?? "", a.productName ?? "");
      case "no_scenario":
        return CATALOG_TEXT.solutionAdviceNoScenario(a.solutionName ?? "");
      case "product_uncovered":
        return CATALOG_TEXT.solutionAdviceUncovered(a.productName ?? "");
    }
  };

  const items: AssistantItem[] = advice.map((a) => ({
    id: a.id,
    text: text(a),
    tone: a.kind === "retired_product" ? "danger" : a.kind === "unpriced_product" ? "warn" : "info",
    link: a.solutionCode
      ? {
          label: CATALOG_TEXT.solutionAdviceOpen,
          href: `/solution/new?code=${encodeURIComponent(a.solutionCode)}`,
        }
      : { label: CATALOG_TEXT.solutionAdviceOpenCatalogue, href: "/catalog" },
    more: [
      { id: "catalogue", label: CATALOG_TEXT.solutionAdviceOpenCatalogue, href: "/catalog" },
      { id: "pricebook", label: CATALOG_TEXT.pricebookLink, href: "/pricebook" },
    ],
  }));

  return (
    <AssistantSection
      section={{
        id: "solution-advice",
        title: CATALOG_TEXT.solutionAdviceTitle,
        items,
        empty: CATALOG_TEXT.solutionAdviceClear,
      }}
    />
  );
}
