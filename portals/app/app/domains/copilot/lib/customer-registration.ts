/** Compare identity only. Never infer a company or fabricate missing facts. */
const nameKey=(v:unknown)=>String(v??"").normalize("NFKC").replace(/\s+/g,"").toLocaleLowerCase();
const creditKey=(v:unknown)=>String(v??"").trim().toUpperCase();
export function duplicateCustomer(fields: Record<string,unknown>, rows: readonly {name:string;creditCode?:string|null}[]): boolean {
  const name=nameKey(fields.name), credit=creditKey(fields.creditCode);
  return rows.some(r => (!!name && nameKey(r.name)===name) || (!!credit && creditKey(r.creditCode)===credit));
}
