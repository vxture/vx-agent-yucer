"use client";

import { Section } from "./help-section";
import { Drawer, Icon } from "@vxture/design-ui";
import { StrategyInfoCard, StrategyInfoContent } from "./strategy-info-card";
import { StrategyDetailLabel, StrategyQuantity } from "./strategy-detail-label";
import layout from "./strategy-info-card.module.css";
import { collectionDrawerWidth } from "./collection-layout";
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
    <Drawer open onClose={onClose} width={collectionDrawerWidth.wide} className="max-w-full" title={view.solution.name}
      description={view.solution.solutionCode} closeLabel={DS_LABELS.confirmCancel}>
      <div className={layout.drawer} data-solution-details>
        <StrategyInfoCard><StrategyInfoContent>
          <dl className="flex min-w-0 flex-col gap-md">
            <div className={layout.field}>
              <dt><StrategyDetailLabel icon="lightbulb">{T.solutionSummary}</StrategyDetailLabel></dt>
              <dd className="whitespace-pre-wrap break-words">{view.solution.summary || T.noScenario}</dd>
            </div>
            <div className={layout.field}>
              <dt><StrategyDetailLabel icon="ticket">{T.colScenario}</StrategyDetailLabel></dt>
              <dd className="whitespace-pre-wrap break-words">{view.solution.scenario || T.noScenario}</dd>
            </div>
          </dl>
        </StrategyInfoContent></StrategyInfoCard>
        <Section title={`${T.solutionPrices} / ${currency}`} icon="coins" help={T.solutionPricesHint}>
          <StrategyInfoCard><StrategyInfoContent>
            <ProductPriceValues price={facts.prices} missing={facts.missing} currency={currency} />
          </StrategyInfoContent></StrategyInfoCard>
        </Section>
        <Section title={T.colComposition} icon="cube"
          description={T.compositionCount(view.items.filter((i) => !i.optional).length, view.items.filter((i) => i.optional).length)}>
          <div className="flex min-w-0 flex-col gap-md" data-solution-composition>
            {view.items.map((item) => {
              const product = byId.get(item.productId);
              return (
                <StrategyInfoCard key={item.id} variant="reference"><StrategyInfoContent>
                  <div className="flex min-w-0 items-start justify-between gap-sm">
                    <span className="inline-flex min-w-0 items-start gap-xs font-medium"><Icon name="cube" size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true" /><span className="break-words">{product?.name ?? T.noCategory}</span></span>
                    <Tag>{item.optional ? T.optionalYes : T.optionalNo}</Tag>
                  </div>
                  <p className="text-body-small text-muted-foreground">{product?.productCode}</p>
                  <div className={layout.field}><StrategyDetailLabel>{T.solutionQuantity}</StrategyDetailLabel><StrategyQuantity value={item.quantity.toLocaleString()}/></div>
                  {item.note ? <p className="whitespace-pre-wrap break-words text-body text-muted-foreground">{item.note}</p> : null}
                </StrategyInfoContent></StrategyInfoCard>
              );
            })}
          </div>
        </Section>
      </div>
    </Drawer>
  );
}
