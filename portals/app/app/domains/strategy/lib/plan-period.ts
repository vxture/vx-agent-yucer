/** Calendar-date execution windows, separate from publication timestamps. */
export interface StrategyPeriod {
  kind: "annual" | "quarter" | "custom" | "half";
  startOn: string;
  endOn: string;
  year: number;
  quarter?: number;
}
export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseStrategyPeriod(value: string): StrategyPeriod | null {
  const text = value.trim();
  const range = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(text);
  if (range) return validCalendarDate(range[1]!) && validCalendarDate(range[2]!) && range[1]! <= range[2]!
    ? {kind:"custom",startOn:range[1]!,endOn:range[2]!,year:Number(range[1]!.slice(0,4))} : null;
  const standard = /^(\d{4})(?:[\s-]?([QH])([1-4]))?$/i.exec(text);
  if (!standard) return null;
  const year = Number(standard[1]);
  if (year < 1900 || year > 9999) return null;
  const kind = standard[2]?.toUpperCase();
  if (!kind) return {kind:"annual",year,startOn:`${year}-01-01`,endOn:`${year}-12-31`};
  const n = Number(standard[3]);
  if (kind === "H" && n > 2) return null;
  const firstMonth = (n - 1) * (kind === "H" ? 6 : 3);
  const lastMonth = firstMonth + (kind === "H" ? 5 : 2);
  return {kind:kind === "H" ? "half" : "quarter",year,...(kind === "Q" ? {quarter:n} : {}),
    startOn:`${year}-${String(firstMonth+1).padStart(2,"0")}-01`,
    endOn:new Date(Date.UTC(year,lastMonth+1,0)).toISOString().slice(0,10)};
}
export function strategyPeriodWindow(value: string): {start: Date; end: Date} | null {
  const period = parseStrategyPeriod(value);
  return period ? {start:new Date(`${period.startOn}T00:00:00.000Z`),end:new Date(`${period.endOn}T23:59:59.999Z`)} : null;
}
export function strategyPeriodRangeLabel(value: string): string | null {
  const period = parseStrategyPeriod(value);
  return period ? `${period.startOn} ~ ${period.endOn}` : null;
}
export function strategyPeriodLabel(value: string): string {
  const period = parseStrategyPeriod(value);
  return period?.kind === "custom" ? `${period.startOn} ~ ${period.endOn}` : value;
}

/** Presets are shortcuts for the same date range, not separate data modes. */
export function strategyPeriodForDates(startOn: string, endOn: string): string | null {
  const custom = `${startOn}/${endOn}`;
  if (!parseStrategyPeriod(custom)) return null;
  const year = Number(startOn.slice(0,4));
  const annual = parseStrategyPeriod(String(year))!;
  if (annual.startOn === startOn && annual.endOn === endOn) return String(year);
  for (const q of [1,2,3,4]) {
    const key = `${year}-Q${q}`; const period = parseStrategyPeriod(key)!;
    if (period.startOn === startOn && period.endOn === endOn) return key;
  }
  return custom;
}
