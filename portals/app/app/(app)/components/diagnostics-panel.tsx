"use client";

import { type ReactNode, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  Section,
} from "@vxture/design-ui";
import type { PlatformCheck, ProbeResult } from "../../api/platform-check/check";
import {
  refreshDiagnosticsAction,
  runAtlasProbeAction,
  runDiagnosticsProbeAction,
} from "../admin/diagnostics/actions";
import { TONE_INK } from "../lib/view-model";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

// 系统验证 > 平台对接 (owner, 2026-09-17).
//
// SECTIONS, PLURAL, FOR A REASON THAT DOES NOT SHOW YET (owner: "预留其他
// 系统验证可扩展"). 平台对接 (the nine check.ts probes) is the only section
// today. It is still its own component with its own props rather than
// inlined into the page, so a second section is "write one more component,
// add one more <Section>" - not a rewrite of this one.
//
// TWO PROBES SPEND, AND NEITHER IS A ProbeCard: the C3 replay probe (a real
// yucer.copilot.turns unit against the workspace's quota) and the Atlas
// live-call probe (a real model call, metered by Atlas itself - owner,
// 2026-09-17: "连接并消耗一点 atlas 的 token，按逻辑 atlas 会上报". Reachability
// alone (planes.atlas above) never proves a call actually completes end to
// end). Both share SpendingProbeCard rather than duplicating the confirm-step
// JSX twice - a stray click must not be able to spend, so both go through the
// same AlertDialog shape - and both are gated separately from the read-only
// probes around them (`canProbe`, admin.diagnostics.probe).

function ProbeCard({ title, probe }: { readonly title: string; readonly probe: ProbeResult }) {
  const tone = !probe.configured ? "neutral" : probe.ok ? "success" : "danger";
  const { DIAGNOSTICS_TEXT } = useMessages();
  const label = !probe.configured
    ? DIAGNOSTICS_TEXT.badgeUnconfigured
    : probe.ok
      ? DIAGNOSTICS_TEXT.badgeOk
      : DIAGNOSTICS_TEXT.badgeFail;
  return (
    <Card className="p-md">
      <div className="flex items-start justify-between gap-sm">
        <p className="text-body-sm font-medium">{title}</p>
        <Tag tone={tone}>{label}</Tag>
      </div>
      <p className="text-muted-foreground mt-xs text-body-sm break-words">{probe.detail}</p>
    </Card>
  );
}

interface SpendResult {
  readonly probeOk: boolean;
  readonly detail: string;
}

function SpendingProbeCard({
  title,
  hint,
  currentDetail,
  result,
  canRun,
  running,
  runLabel,
  runningLabel,
  confirmTitle,
  confirmBody,
  confirmAction,
  cancelLabel,
  forbiddenLabel,
  onConfirm,
}: {
  readonly title: string;
  readonly hint: string;
  /** What to show before this probe has been run this page-load (check.ts's own static description). */
  readonly currentDetail: string;
  readonly result: SpendResult | null;
  readonly canRun: boolean;
  readonly running: boolean;
  readonly runLabel: string;
  readonly runningLabel: string;
  readonly confirmTitle: string;
  readonly confirmBody: string;
  readonly confirmAction: string;
  readonly cancelLabel: string;
  readonly forbiddenLabel: string;
  readonly onConfirm: () => void;
}): ReactNode {
  return (
    <Card className="border-dashed p-md">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-medium">{title}</p>
          <p className="text-muted-foreground mt-2xs max-w-prose text-body-sm">{hint}</p>
          <p
            className={`mt-sm text-body-sm ${result ? TONE_INK[result.probeOk ? "success" : "danger"] : "text-muted-foreground"}`}
          >
            {result ? result.detail : currentDetail}
          </p>
        </div>
        {canRun ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary" size="sm" disabled={running}>
                {running ? runningLabel : runLabel}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{confirmBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
                <AlertDialogAction onClick={onConfirm}>{confirmAction}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Tag>{forbiddenLabel}</Tag>
        )}
      </div>
    </Card>
  );
}

export function DiagnosticsPanel({
  initialCheck,
  canProbe,
}: {
  readonly initialCheck: PlatformCheck;
  readonly canProbe: boolean;
}) {
  const { DIAGNOSTICS_TEXT } = useMessages();
  const [check, setCheck] = useState(initialCheck);
  const [replayResult, setReplayResult] = useState<SpendResult | null>(null);
  const [atlasResult, setAtlasResult] = useState<SpendResult | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [replaying, startReplay] = useTransition();
  const [probingAtlas, startAtlasProbe] = useTransition();

  const handleRefresh = () => {
    startRefresh(async () => {
      const result = await refreshDiagnosticsAction();
      if (result.ok) setCheck(result.check);
    });
  };

  const handleRunReplay = () => {
    startReplay(async () => {
      const result = await runDiagnosticsProbeAction();
      setReplayResult(
        result.ok
          ? { probeOk: result.probeOk, detail: result.detail }
          : { probeOk: false, detail: result.error },
      );
    });
  };

  const handleRunAtlasProbe = () => {
    startAtlasProbe(async () => {
      const result = await runAtlasProbeAction();
      setAtlasResult(
        result.ok
          ? { probeOk: result.probeOk, detail: result.detail }
          : { probeOk: false, detail: result.error },
      );
    });
  };

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex items-center justify-between gap-md">
        <p className="text-muted-foreground text-body-sm">{DIAGNOSTICS_TEXT.probedAt(check.time)}</p>
        <Button variant="secondary" size="sm" disabled={refreshing} onClick={handleRefresh}>
          {DIAGNOSTICS_TEXT.refresh}
        </Button>
      </div>

      <Section
        id="platform-integration"
        icon="plugs-connected"
        title={DIAGNOSTICS_TEXT.sectionPlatform}
        description={DIAGNOSTICS_TEXT.sectionPlatformHint}
      >
        <p className="text-muted-foreground mb-sm text-body-sm">{DIAGNOSTICS_TEXT.readOnlyNote}</p>
        <div className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-3">
          <ProbeCard title={DIAGNOSTICS_TEXT.probe.c1} probe={check.c1} />
          <ProbeCard title={DIAGNOSTICS_TEXT.probe.tokenMint} probe={check.tokenMint} />
          <ProbeCard title={DIAGNOSTICS_TEXT.probe.c2} probe={check.c2} />
          <ProbeCard title={DIAGNOSTICS_TEXT.probe.c3Up} probe={check.c3Up} />
          <ProbeCard title={DIAGNOSTICS_TEXT.probe.c3Down} probe={check.c3Down} />
          <ProbeCard title={DIAGNOSTICS_TEXT.probe.runos} probe={check.planes.runos} />
          <ProbeCard title={DIAGNOSTICS_TEXT.probe.arda} probe={check.planes.arda} />
        </div>

        <div className="mt-md flex flex-col gap-md">
          <SpendingProbeCard
            title={DIAGNOSTICS_TEXT.replayTitle}
            hint={DIAGNOSTICS_TEXT.replayHint}
            currentDetail={check.c3Replay.detail}
            result={replayResult}
            canRun={canProbe}
            running={replaying}
            runLabel={DIAGNOSTICS_TEXT.replayButton}
            runningLabel={DIAGNOSTICS_TEXT.replayRunning}
            confirmTitle={DIAGNOSTICS_TEXT.replayConfirmTitle}
            confirmBody={DIAGNOSTICS_TEXT.replayConfirmBody}
            confirmAction={DIAGNOSTICS_TEXT.replayConfirmAction}
            cancelLabel={DIAGNOSTICS_TEXT.cancel}
            forbiddenLabel={DIAGNOSTICS_TEXT.replayForbidden}
            onConfirm={handleRunReplay}
          />

          {/* Atlas reachability (planes.atlas) sits here rather than in the
              read-only grid above - this card supersedes it visually since
              both talk about the same plane, and a HTTP-reachable-but-never-
              actually-called Atlas is exactly the gap this probe exists to
              close. */}
          <SpendingProbeCard
            title={DIAGNOSTICS_TEXT.atlasProbeTitle}
            hint={DIAGNOSTICS_TEXT.atlasProbeHint}
            currentDetail={check.planes.atlas.detail}
            result={atlasResult}
            canRun={canProbe}
            running={probingAtlas}
            runLabel={DIAGNOSTICS_TEXT.atlasProbeButton}
            runningLabel={DIAGNOSTICS_TEXT.atlasProbeRunning}
            confirmTitle={DIAGNOSTICS_TEXT.atlasProbeConfirmTitle}
            confirmBody={DIAGNOSTICS_TEXT.atlasProbeConfirmBody}
            confirmAction={DIAGNOSTICS_TEXT.atlasProbeConfirmAction}
            cancelLabel={DIAGNOSTICS_TEXT.cancel}
            forbiddenLabel={DIAGNOSTICS_TEXT.atlasProbeForbidden}
            onConfirm={handleRunAtlasProbe}
          />
        </div>
      </Section>
    </div>
  );
}
