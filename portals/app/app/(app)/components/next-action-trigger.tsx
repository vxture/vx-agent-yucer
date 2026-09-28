"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/i18n/provider";
import { explainModelPlaneError, isModelPlaneError } from "../lib/model-plane-error";
import type { NextActionResult } from "../pipeline/next-action-action";

// 下一步最佳动作's trigger in 本单参谋 (deal batch 8c). Mounted only when the
// deck found that this deal's data has had no run today and no next action
// waits for a decision; it asks once, and when an action was filed the deck
// re-reads so it appears among this deal's proposals, decided there.
// A refusal is one quiet line - 局势简报 above already says what the model
// plane is doing.

export function NextActionTrigger({
  opportunityId,
  onRun,
}: {
  readonly opportunityId: string;
  readonly onRun: (opportunityId: string) => Promise<NextActionResult>;
}) {
  const { NEXT_ACTION_TEXT: T, NEXT_ACTION_ERROR, COPILOT_TEXT } = useMessages();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    start(async () => {
      const r = await onRun(opportunityId);
      if (!r.ok) {
        setError(isModelPlaneError(r.error) ? explainModelPlaneError(r.error, COPILOT_TEXT) : (NEXT_ACTION_ERROR[r.error] ?? NEXT_ACTION_ERROR.unknown ?? r.error));
        return;
      }
      if (r.proposed > 0) router.refresh();
    });
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pending) return <p className="text-muted-foreground text-body-sm">{T.thinking}</p>;
  if (error) return <p className="text-muted-foreground text-body-sm">{T.failed(error)}</p>;
  return null;
}
