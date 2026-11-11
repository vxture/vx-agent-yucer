"use client";

import { DetailList, DetailRow, Drawer, Section } from "@vxture/design-ui";
import type { ProductRecord } from "../../domains/catalog/store";
import type { SolutionFacts } from "../lib/solution-prices";
import { useMessages } from "../lib/i18n/provider";
import { ProductPriceValues } from "./product-price-values";
import type { SolutionView } from "./solution-roster";
import { Tag } from "./tag";

/** Reading a solution's prose and composition does not require edit access. */
export function SolutionDetails({ view, products, facts, currency, onClose }: {
  readonly view: SolutionView;
  readonly products: readonly ProductRecord[];
  readonly facts: SolutionFacts;
  readonly currency: string;
  readonly onClose: () => void;
}) {
  const { CATALOG_TEXT: T, DS_LABELS } = useMessages();
  const byId = new Map(products.map((p) => [p.id, p]));
  return (
    <Drawer open onClose={onClose} width="lg" title={view.solution.name}
      description={view.solution.solutionCode} closeLabel={DS_LABELS.confirmCancel}>
      <div className="flex flex-col gap-xl">
        <DetailList columns={1}>
          <DetailRow label={T.solutionSummary}>
            <p className="whitespace-pre-wrap break-words">{view.solution.summary || T.noScenario}</p>
          </DetailRow>
          <DetailRow label={T.colScenario}>
            <p className="whitespace-pre-wrap break-words">{view.solution.scenario || T.noScenario}</p>
          </DetailRow>
        </DetailList>
        <Section title={`${T.solutionPrices} / ${currency}`} description={T.solutionPricesHint}>
          <ProductPriceValues price={facts.prices} missing={facts.missing} currency={currency} />
        </Section>
        <Section title={T.colComposition}
          description={T.compositionCount(view.items.filter((i) => !i.optional).length, view.items.filter((i) => i.optional).length)}>
          <DetailList columns={1}>
            {view.items.map((item) => {
              const product = byId.get(item.productId);
              return (
                <DetailRow key={item.id} label={product?.name ?? T.noCategory}>
                  <div className="flex min-w-0 flex-col gap-xs">
                    <div className="flex flex-wrap items-center gap-sm">
                      <span className="text-body-small text-muted-foreground">{product?.productCode}</span>
                      <span className="text-body-small tabular-nums">{T.solutionQuantity}: {item.quantity.toLocaleString()}</span>
                      <Tag>{item.optional ? T.optionalYes : T.optionalNo}</Tag>
                    </div>
                    {item.note ? <p className="whitespace-pre-wrap break-words text-body-small text-muted-foreground">{item.note}</p> : null}
                  </div>
                </DetailRow>
              );
            })}
          </DetailList>
        </Section>
      </div>
    </Drawer>
  );
}
