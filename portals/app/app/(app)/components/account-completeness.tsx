"use client";

import { useState, useTransition } from "react";
import { Button, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { explainModelPlaneError, isModelPlaneError } from "../lib/model-plane-error";

// What is missing from this customer, and who can answer it.
//
// TWO GROUPS, SHOWN AS TWO GROUPS, because they cost different things and the
// reader should be able to tell at a glance:
//
//   the data already knows   one click, free, certain. The basis is printed
//                            beside it - a fill that cannot say where the value
//                            came from is a machine writing into a customer
//                            record on nobody's authority, and the person
//                            clicking is who answers for it.
//   the assistant can find   a fact about the world rather than about these
//                            rows. It goes through the copilot queue like every
//                            other thing the machine suggests, so accepting it
//                            carries the same signature.
//
// NOTHING IS FILLED WITHOUT A CLICK, including the free half. ADR-003 is not
// about how expensive the answer was.

export interface CompletenessGap {
  readonly field: string;
  readonly suggestion: string | null;
  readonly basis: string | null;
  readonly forModel: boolean;
}

export interface AccountCompletenessProps {
  readonly accountId: string;
  readonly gaps: readonly CompletenessGap[];
  readonly canFill: boolean;
  readonly onFill: (
    accountId: string,
    field: string,
    value: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Spend a model turn on the gaps the data cannot close.
   *
   * A SEPARATE, EXPLICIT ACT. It costs money and takes seconds, so it is never
   * something that happens because a page rendered - and the answer does not
   * land here, it lands in the proposal queue for somebody to accept.
   */
  readonly onAsk?: (accountId: string) => Promise<{ ok: boolean; error?: string }>;
  readonly canAsk?: boolean;
}

export function AccountCompleteness({
  accountId,
  gaps,
  canFill,
  onFill,
  onAsk,
  canAsk = false,
}: AccountCompletenessProps) {
  const { COMPLETENESS_TEXT, COMPLETENESS_ERROR, COPILOT_TEXT } = useMessages();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  // NOTHING TO SAY IS SAID BY SAYING NOTHING. A permanent "this record is
  // complete" panel is furniture on every account that is fine, and furniture
  // is what people stop reading.
  if (gaps.length === 0) return null;

  // ONE MAPPING FOR THE MODEL PLANE, shared with the copilot chat. Atlas
  // composes its codes at runtime (`atlas_${code}`), so no dictionary can
  // enumerate them - and this surface printed `atlas_ATLAS_NOT_CONFIGURED` at a
  // reader until it used the same translation the chat already had.
  const explain = (code: string | undefined): string => {
    const c = code ?? "denied";
    if (isModelPlaneError(c)) return explainModelPlaneError(c, COPILOT_TEXT);
    return COMPLETENESS_ERROR[c] ?? c;
  };

  const derivable = gaps.filter((g) => g.suggestion !== null);
  const askable = gaps.filter((g) => g.forModel);
  // WHAT IS LEFT OVER IS NOT RENDERED, and that is a decision rather than an
  // omission. A gap with no suggestion, no model question and no sentence of
  // its own is one waiting on ANOTHER gap - a segment cannot be matched until
  // the industry is known, and it resolves itself the moment that one is
  // filled. Printing it would put a bare field name on screen and ask the
  // reader to do something they cannot do yet.
  const structural = gaps.filter(
    (g) => g.suggestion === null && !g.forModel && COMPLETENESS_TEXT.structural[g.field],
  );

  return (
    <Section title={COMPLETENESS_TEXT.title} description={COMPLETENESS_TEXT.description}>
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      {derivable.map((g) => (
        <div key={g.field} className="flex items-center justify-between gap-md">
          <span className="flex flex-col gap-3xs">
            <span className="text-foreground text-sm">
              {COMPLETENESS_TEXT.fields[g.field] ?? g.field}
              {": "}
              {g.suggestion}
            </span>
            {/* THE BASIS, always. See the header. */}
            <span className="text-muted-foreground text-xs">{g.basis}</span>
          </span>
          {canFill ? (
            <Button
              size="sm"
              disabled={pending && busy === g.field}
              onClick={() => {
                setBusy(g.field);
                setError(null);
                startTransition(() => {
                  void onFill(accountId, g.field, g.suggestion as string)
                    .then((r) => {
                      if (!r.ok) setError(explain(r.error));
                    })
                    .finally(() => setBusy(null));
                });
              }}
            >
              {COMPLETENESS_TEXT.fill}
            </Button>
          ) : null}
        </div>
      ))}

      {askable.length > 0 ? (
        <div className="flex items-start justify-between gap-md">
          <p className="text-muted-foreground text-xs">
            {COMPLETENESS_TEXT.askable(
              COMPLETENESS_TEXT.joinFields(
                askable.map((g) => COMPLETENESS_TEXT.fields[g.field] ?? g.field),
              ),
            )}
          </p>
          {canAsk && onAsk ? (
            // ASKED ONCE, then it says where the answer went. Offering the
            // button again would invite paying twice for the same question, and
            // the answer is not here anyway - it is in the queue.
            asked ? (
              <StatusBadge tone="info">{COMPLETENESS_TEXT.askedNote}</StatusBadge>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending && busy === "ask"}
                onClick={() => {
                  setBusy("ask");
                  setError(null);
                  startTransition(() => {
                    void onAsk(accountId)
                      .then((r) => {
                        if (r.ok) setAsked(true);
                        else setError(explain(r.error));
                      })
                      .finally(() => setBusy(null));
                  });
                }}
              >
                {COMPLETENESS_TEXT.ask}
              </Button>
            )
          ) : null}
        </div>
      ) : null}

      {structural.map((g) => (
        <StatusBadge key={g.field} tone="warning">
          {COMPLETENESS_TEXT.structural[g.field] ?? g.basis ?? g.field}
        </StatusBadge>
      ))}
    </Section>
  );
}
