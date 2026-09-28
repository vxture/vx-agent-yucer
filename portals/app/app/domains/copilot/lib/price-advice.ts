// 价格参谋 (deal batch 10b, YC-066 S4): with a line waiting for a signature,
// a discount strategy and what to ask in exchange - written by the model,
// ADMITTED BY THE RULE before anyone sees it.
//
// THE NUMBERS ARE THE RULE'S. The approver reads list, floor, quote and the
// deal's concession from the concession sheet beside the advice (YC-070: "底价
// 与让价数字与规则数据完全一致"), so the advice may repeat those figures and
// nothing else: a sentence carrying an amount or a percentage that is not on
// the sheet is dropped, never shown. The model is told the same thing.
//
// THE BUYER'S WORDS ARE QUOTED, NOT PARAPHRASED. Each quote names the
// follow-up it comes from and must appear in it verbatim; one that does not is
// dropped. Advice with nothing left after admission is no advice.

export const PRICE_CAPABILITY = "deal.price";
export const PRICE_SESSION_MARK = "[price-advice]";
/** The follow-ups the advice may read, newest first. */
export const PRICE_NOTE_WINDOW = 20;
const MAX_TRADES = 4;
const MAX_QUOTES = 3;

export interface PriceSheetLine {
  readonly product: string;
  readonly quantity: number;
  readonly listPrice: number | null;
  readonly floorPrice: number | null;
  readonly unitPrice: number;
  readonly belowFloor: number;
}

export interface PriceAdviceInput {
  readonly dealName: string;
  readonly currency: string;
  readonly lines: readonly PriceSheetLine[];
  readonly listAmount: number | null;
  readonly concession: number | null;
  /** 0..1 */
  readonly rate: number | null;
  readonly notes: readonly { readonly id: string; readonly date: string; readonly text: string }[];
}

export interface PriceAdvice {
  readonly strategy: string;
  readonly trades: readonly string[];
  readonly quotes: readonly { readonly noteId: string; readonly text: string }[];
  /** Sentences, trades and quotes the rule refused. */
  readonly dropped: number;
}

/** The instruction for one advice. English, like every prompt in this repo. */
export function priceQuestion(input: PriceAdviceInput): string {
  const money = (n: number | null) => (n === null ? "n/a" : `${n}`);
  const lines = input.lines.map(
    (l) =>
      `  - ${l.product} x${l.quantity}: list ${money(l.listPrice)}, floor ${money(l.floorPrice)}, quoted ${l.unitPrice}` +
      (l.belowFloor > 0 ? `, ${l.belowFloor} below the floor` : ""),
  );
  const pct = input.rate === null ? "n/a" : `${Math.round(input.rate * 1000) / 10}%`;
  return [
    `${PRICE_SESSION_MARK} Advise on the discount in the deal "${input.dealName}" (currency ${input.currency}).`,
    `A line is priced below its floor and waits for an approver's signature. The price sheet, from the price book:`,
    ...lines,
    `Deal total at list ${money(input.listAmount)}; concession ${money(input.concession)} (${pct}).`,
    `The deal's follow-up notes, newest first:`,
    ...input.notes.map((n) => `  [${n.id}] ${n.date}: ${n.text}`),
    ``,
    `Answer with ONE JSON object and nothing else:`,
    `{"strategy": "<2-3 sentences: how to hold or move on price>",`,
    ` "trades": ["<something to ask the buyer in exchange for the discount>", ...],`,
    ` "quotes": [{"noteId": "<id from the brackets>", "text": "<the buyer's words about price, copied exactly>"}]}`,
    `Rules: use only the amounts and percentages above - never invent a new price, discount or percentage;`,
    `quote only words that appear verbatim in a note; do not recommend approving or rejecting - the approver decides.`,
    `At most ${MAX_TRADES} trades and ${MAX_QUOTES} quotes. Write in the language of the notes.`,
  ].join("\n");
}

/**
 * Every figure the advice may repeat, by kind: amounts (in yuan and in 万, as
 * the page speaks) and percentages (the deal's rate and each line's discount
 * off list). Kept apart so 80,000 - "8 万" - never licenses "8%".
 */
export interface AllowedFigures {
  readonly amounts: ReadonlySet<string>;
  readonly percents: ReadonlySet<string>;
}

const key = (n: number) => String(Math.round(n * 100) / 100);

export function allowedFigures(input: PriceAdviceInput): AllowedFigures {
  const amounts = new Set<string>();
  const wan = new Set<string>();
  const percents = new Set<string>();
  const add = (n: number | null) => {
    if (n === null) return;
    amounts.add(key(n));
    if (n >= 10_000) wan.add(key(n / 10_000));
  };
  const pct = (ratio: number) => {
    percents.add(key(Math.round(ratio * 1000) / 10));
    percents.add(key(Math.round(ratio * 100)));
  };
  for (const l of input.lines) {
    add(l.listPrice);
    add(l.floorPrice);
    add(l.unitPrice);
    add(l.belowFloor > 0 ? l.belowFloor : null);
    add(l.listPrice === null ? null : l.listPrice * l.quantity);
    add(l.unitPrice * l.quantity);
    if (l.listPrice !== null && l.listPrice > 0) pct(1 - l.unitPrice / l.listPrice);
  }
  add(input.listAmount);
  add(input.concession);
  if (input.rate !== null) pct(input.rate);
  return { amounts: new Set([...amounts, ...wan]), percents };
}

/** A figure followed by one of these is a date or a count, not a price. */
const COUNT_UNIT = /^(\u5e74|\u4e2a\u6708|\u6708|\u65e5|\u53f7|\u5929|\u5468|\u671f|\u6b21|\u4eba|\u5bb6|\u5957|\u4e2a|\u9879|\u6761|\u53f0|\u5e74\u5ea6|\u5b63\u5ea6|Q)/;

/**
 * True when every money-like figure in the text is on the sheet. A percentage
 * and a 万 amount always count; a figure followed by a date or count unit
 * ("2026 年", "3 期") is not a price and passes; any other bare figure of 100
 * or more counts; small bare figures pass.
 */
export function figuresConsistent(text: string, allowed: AllowedFigures): boolean {
  const plain = text.replace(/(\d),(?=\d{3})/g, "$1");
  for (const m of plain.matchAll(/(\d+(?:\.\d+)?)\s*(%|\uff05|\u4e07)?/g)) {
    const value = Number(m[1]);
    const unit = m[2];
    const after = plain.slice((m.index ?? 0) + m[0].length);
    if (unit === undefined) {
      if (COUNT_UNIT.test(after)) continue;
      if (value < 100) continue;
    }
    const set = unit === "%" || unit === "\uff05" ? allowed.percents : allowed.amounts;
    if (!set.has(key(value))) return false;
  }
  return true;
}

/** Split into sentences, keep the consistent ones. */
function admitSentences(text: string, allowed: AllowedFigures): { kept: string; dropped: number } {
  // A full stop ends a sentence only before a space - "26.2%" is one figure.
  const parts = text.split(/(?<=[\u3002\uff01\uff1f!?])\s*|(?<=\.)\s+/).filter((s) => s.trim() !== "");
  const kept = parts.filter((s) => figuresConsistent(s, allowed));
  return { kept: kept.join("").trim(), dropped: parts.length - kept.length };
}

/**
 * The model's answer, admitted. Null when nothing survives - or when the
 * answer is not the JSON object asked for.
 */
export function admitPriceAdvice(answer: string, input: PriceAdviceInput): PriceAdvice | null {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: { strategy?: unknown; trades?: unknown; quotes?: unknown };
  try {
    raw = JSON.parse(answer.slice(start, end + 1)) as typeof raw;
  } catch {
    return null;
  }
  const allowed = allowedFigures(input);
  let dropped = 0;

  const strategy = admitSentences(typeof raw.strategy === "string" ? raw.strategy : "", allowed);
  dropped += strategy.dropped;

  const trades: string[] = [];
  for (const t of Array.isArray(raw.trades) ? raw.trades : []) {
    const text = typeof t === "string" ? t.trim() : "";
    if (text === "" || trades.length >= MAX_TRADES || !figuresConsistent(text, allowed)) {
      if (text !== "") dropped += 1;
      continue;
    }
    trades.push(text);
  }

  const notes = new Map(input.notes.map((n) => [n.id, n.text]));
  const quotes: { noteId: string; text: string }[] = [];
  for (const q of Array.isArray(raw.quotes) ? raw.quotes : []) {
    const noteId = typeof (q as { noteId?: unknown })?.noteId === "string" ? (q as { noteId: string }).noteId : "";
    const text = typeof (q as { text?: unknown })?.text === "string" ? (q as { text: string }).text.trim() : "";
    const source = notes.get(noteId);
    if (!source || text === "" || !source.includes(text) || quotes.length >= MAX_QUOTES) {
      dropped += 1;
      continue;
    }
    quotes.push({ noteId, text });
  }

  if (strategy.kept === "" && trades.length === 0) return null;
  return { strategy: strategy.kept, trades, quotes, dropped };
}
