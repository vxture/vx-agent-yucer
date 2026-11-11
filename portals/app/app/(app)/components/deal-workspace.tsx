"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsTrigger } from "@vxture/design-ui";
import { TabsList } from "./business-controls";
import { useMessages } from "../lib/i18n/provider";
import { dealWorkspaceHref, WORKSPACE_STEPS, type WorkspaceStep, type WorkspaceView } from "../lib/deal-workspace";

// Keep the existing deal page and its editors mounted. Changing the working
// view or step must not throw away a note, attendee selection or meeting pack.
export function DealWorkspace({ opportunityId, initialView, initialStep, children, plan, prepare, feedback, history }: {
  readonly opportunityId: string;
  readonly initialView: WorkspaceView;
  readonly initialStep: WorkspaceStep;
  readonly children: ReactNode;
  readonly plan: ReactNode;
  readonly prepare: ReactNode;
  readonly feedback: ReactNode;
  readonly history: ReactNode;
}) {
  const { DEAL_PAGE_TEXT: { workspace: T } } = useMessages();
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [step, setStep] = useState(initialStep);
  const [pending, start] = useTransition();
  useEffect(() => { setView(initialView); setStep(initialStep); }, [initialView, initialStep]);
  // A source link may target a panel that was hidden during navigation.
  // Scroll after the analysis view is visible, rather than losing the hash.
  useEffect(() => {
    if (view !== "analysis" || !window.location.hash) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);
  const navigate = (nextView: WorkspaceView, nextStep: WorkspaceStep) => {
    setView(nextView); setStep(nextStep);
    start(() => router.push(dealWorkspaceHref(opportunityId, nextView, nextStep, window.location.search), { scroll: false }));
  };
  const panels = { plan, prepare, feedback, history };
  return (
    <Tabs value={view} onValueChange={(value) => navigate(value as WorkspaceView, step)} className="flex min-w-0 flex-col gap-lg" aria-busy={pending}>
      <TabsList aria-label={T.views} className="max-w-full self-start overflow-x-auto">
        <TabsTrigger value="analysis">{T.analysis}</TabsTrigger>
        <TabsTrigger value="progress">{T.progress}</TabsTrigger>
      </TabsList>
      <TabsContent value="analysis" forceMount hidden={view !== "analysis"} className={view === "analysis" ? "flex min-w-0 flex-col gap-lg" : "hidden"}>{children}</TabsContent>
      <TabsContent value="progress" forceMount hidden={view !== "progress"} className={view === "progress" ? "flex min-w-0 flex-col gap-lg" : "hidden"}>
        <Tabs value={step} onValueChange={(value) => navigate("progress", value as WorkspaceStep)} className="flex min-w-0 flex-col gap-lg">
          <TabsList aria-label={T.steps} className="max-w-full self-start overflow-x-auto">
            {WORKSPACE_STEPS.map((key) => <TabsTrigger key={key} value={key}>{T[key]}</TabsTrigger>)}
          </TabsList>
          {WORKSPACE_STEPS.map((key) => <TabsContent key={key} value={key} forceMount hidden={step !== key} className={step === key ? "flex min-w-0 flex-col gap-lg" : "hidden"}>{panels[key]}</TabsContent>)}
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
