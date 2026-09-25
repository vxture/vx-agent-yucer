"use client";

import { useTransition } from "react";
import { Button, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { explainModelPlaneError, isModelPlaneError } from "../lib/model-plane-error";

// 生成计划草案 (deal batch 5c): asks the advisor for 3-6 steps toward this
// stage's unmet exit criteria. The steps arrive as proposals under 推进计划;
// nothing becomes a promise until a person accepts it.

export function PlanDraftButton({
  opportunityId,
  onGenerate,
}: {
  readonly opportunityId: string;
  readonly onGenerate: (
    opportunityId: string,
  ) => Promise<{ ok: true; proposed: number; cached: boolean } | { ok: false; error: string }>;
}) {
  const { DEAL_PAGE_TEXT, PLAN_DRAFT_ERROR, COPILOT_TEXT } = useMessages();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await onGenerate(opportunityId);
          if (!r.ok) {
            // The model plane's own codes (atlas_*) say the same thing here as
            // in the copilot chat - one helper, one sentence per code.
            const title =
              PLAN_DRAFT_ERROR[r.error] ??
              (isModelPlaneError(r.error) ? explainModelPlaneError(r.error, COPILOT_TEXT) : undefined) ??
              PLAN_DRAFT_ERROR.unknown ??
              r.error;
            toast({ tone: "danger", title });
            return;
          }
          toast({
            tone: r.proposed > 0 ? "success" : "info",
            title: r.cached ? DEAL_PAGE_TEXT.planCached(r.proposed) : DEAL_PAGE_TEXT.planDone(r.proposed),
          });
        })
      }
    >
      {pending ? DEAL_PAGE_TEXT.planGenerating : DEAL_PAGE_TEXT.planGenerate}
    </Button>
  );
}
