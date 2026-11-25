import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { SIGNAL_TYPES, type SignalType } from "./scoring";
import type { NewSignal, SignalRecord } from "../store";

export const SIGNAL_INPUT_LIMITS = { subject: 255, companyName: 200, summary: 1200, sourceUrl: 2000 } as const;

export function signalText(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** A link is evidence, never an executable URL or an opaque external id. */
export function signalSourceUrl(signal: Pick<SignalRecord, "payload" | "sourceRef">): string | null {
  for (const raw of [signalText(signal.payload, "source_url", "url"), signal.sourceRef]) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch { /* An opaque source reference is not a link. */ }
  }
  return null;
}

export interface SignalRegistration {
  requestId: string;
  subject: string;
  signalType: SignalType;
  companyName: string;
  summary: string;
  accountId?: string | null;
  sourceUrl?: string;
  detectedAt: string;
  deadline?: string;
  amount?: string;
}

/** Manual evidence is declared as manual. It cannot impersonate Arda/a campaign. */
export function planSignalRegistration(input: SignalRegistration, now = new Date()): RuleResult<NewSignal> {
  if (!input || typeof input !== "object" ||
    ["sourceUrl", "deadline", "amount", "accountId"].some(key => {
      const value = input[key as keyof SignalRegistration];
      return value !== undefined && value !== null && typeof value !== "string";
    })) return fail(violation("signal_input_invalid", "invalid registration input", "input"));
  if (typeof input.requestId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)) {
    return fail(violation("signal_input_invalid", "a registration needs a stable request id", "requestId"));
  }
  for (const key of ["subject", "companyName", "summary"] as const) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].trim().length > SIGNAL_INPUT_LIMITS[key]) {
      return fail(violation("signal_input_invalid", "required evidence is missing or too long", key));
    }
  }
  if (!(SIGNAL_TYPES as readonly string[]).includes(input.signalType)) {
    return fail(violation("unknown_signal_type", "unknown signal type", "signalType"));
  }
  if (typeof input.detectedAt !== "string" || !input.detectedAt.trim()) {
    return fail(violation("signal_input_invalid", "invalid evidence date", "detectedAt"));
  }
  const detectedAt = new Date(input.detectedAt);
  if (!Number.isFinite(detectedAt.getTime()) || detectedAt.getTime() > now.getTime() + 86_400_000) {
    return fail(violation("signal_input_invalid", "invalid evidence date", "detectedAt"));
  }
  const sourceUrl = input.sourceUrl?.trim() ?? "";
  if (sourceUrl && (sourceUrl.length > SIGNAL_INPUT_LIMITS.sourceUrl || !signalSourceUrl({ payload: {}, sourceRef: sourceUrl }))) {
    return fail(violation("signal_input_invalid", "source must be an http(s) URL without credentials", "sourceUrl"));
  }
  const amount = input.amount?.trim() ?? "";
  if (amount && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) {
    return fail(violation("signal_input_invalid", "amount must be a nonnegative finite number", "amount"));
  }
  const deadline = input.deadline?.trim() ?? "";
  if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(Date.parse(deadline)) || new Date(deadline).toISOString().slice(0, 10) !== deadline)) {
    return fail(violation("signal_input_invalid", "invalid deadline", "deadline"));
  }
  return ok({
    source: "manual",
    sourceRef: input.requestId,
    signalType: input.signalType,
    subject: input.subject.trim(),
    accountId: input.accountId || null,
    detectedAt,
    payload: {
      company_name: input.companyName.trim(), summary: input.summary.trim(),
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      ...(deadline ? { deadline } : {}),
      ...(amount ? { amount: Number(amount), currency: "CNY" } : {}),
    },
  });
}

export function isPendingSignal(signal: Pick<SignalRecord, "status">): boolean {
  return signal.status === "new" || signal.status === "scored";
}
