/** solution_item.quantity is NUMERIC(12,2); never silently round the draft. */
export const SOLUTION_QUANTITY_MAX = 9_999_999_999.99;
export function validSolutionQuantity(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= SOLUTION_QUANTITY_MAX && Number(value.toFixed(2)) === value;
}
