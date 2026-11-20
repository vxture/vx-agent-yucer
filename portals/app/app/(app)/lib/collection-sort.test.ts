import { test } from "node:test";
import assert from "node:assert/strict";
import type { MarketView, StrategyView } from "./market-strategy";
import { strategySortAccessors as strategy, marketSortAccessors as market } from "./collection-sort";
import type { ProductReference, SolutionReference } from "../../domains/catalog/service";
import { sortRowsBy } from "./table-sort";

const product: ProductReference = { id: "product", productCode: "PRD", name: "product", status: "active" };
const solution: SolutionReference = { id: "solution", solutionCode: "SOL", name: "solution", status: "active" };

const plan = (values: Partial<StrategyView>) => ({ name: "", marketIds: [], customerCount: 0,
  solutions: [], products: [], campaigns: [], status: "draft", ...values }) as StrategyView;
const segment = (values: Partial<MarketView>) => ({ name: "", matched: 0,
  defaultSolutions: [], defaultProducts: [], plans: [], status: "active", ...values }) as MarketView;

test("strategy sorting keeps unknown reference totals last in either direction", () => {
  const unknown = plan({ name: "unknown", solutions: null });
  const zero = plan({ name: "zero" });
  const several = plan({ name: "several", solutions: [solution], products: [product, {...product,id:"product-2"}] });
  const original = [unknown, several, zero];
  assert.deepEqual(sortRowsBy(original,strategy.solutions,"asc").map(p=>p.name),["zero","several","unknown"]);
  assert.deepEqual(sortRowsBy(original,strategy.solutions,"desc").map(p=>p.name),["several","zero","unknown"]);
  assert.deepEqual(original,[unknown,several,zero]);
  assert.equal(strategy.markets(plan({marketIds:null})),undefined);
  assert.equal(strategy.campaigns(plan({campaigns:null})),undefined);
});

test("market sort reads combined product/solution counts and respects unreadable data", () => {
  assert.equal(market.offerings(segment({defaultProducts:[product,{...product,id:"product-2"}],defaultSolutions:[solution]})),3);
  assert.equal(market.offerings(segment({defaultProducts:null})),null);
  assert.equal(market.offerings(segment({defaultSolutions:undefined})),null);
  assert.equal(market.plan(segment({plans:null})),undefined);
  assert.equal(market.plan(segment({plans:[]})),0);
  const rows=[segment({name:"unknown",matched:null}),segment({name:"ten",matched:10}),segment({name:"two",matched:2})];
  assert.deepEqual(sortRowsBy(rows,market.customers,"desc").map(p=>p.name),["ten","two","unknown"]);
});

test("status sorting follows lifecycle progression rather than translated labels", () => {
  const plans=[plan({status:"active"}),plan({status:"draft"}),plan({status:"approved"})];
  assert.deepEqual(sortRowsBy(plans,strategy.status,"asc").map(p=>p.status),["draft","approved","active"]);
  const markets=[segment({status:"retired"}),segment({status:"paused"}),segment({status:"active"})];
  assert.deepEqual(sortRowsBy(markets,market.status,"asc").map(p=>p.status),["active","paused","retired"]);
});
