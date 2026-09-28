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

import { admitSentences, allowFigures, figuresConsistent, type AllowedFigures } from "./figures";

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

/** Every figure the advice may repeat: the sheet's amounts, the deal rate
 *  and each line's discount off list. */
export function allowedFigures(input: PriceAdviceInput): AllowedFigures {
  const amounts: (number | null)[] = [input.listAmount, input.concession];
  const ratios: (number | null)[] = [input.rate];
  for (const l of input.lines) {
    amounts.push(l.listPrice, l.floorPrice, l.unitPrice, l.belowFloor > 0 ? l.belowFloor : null);
    amounts.push(l.listPrice === null ? null : l.listPrice * l.quantity, l.unitPrice * l.quantity);
    if (l.listPrice !== null && l.listPrice > 0) ratios.push(1 - l.unitPrice / l.listPrice);
  }
  return allowFigures({ amounts, ratios });
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

  const strategyParts = admitSentences(typeof raw.strategy === "string" ? raw.strategy : "", allowed);
  const strategy = { kept: strategyParts.kept.join("").trim(), dropped: strategyParts.dropped };
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
