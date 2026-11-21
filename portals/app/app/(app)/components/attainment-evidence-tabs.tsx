"use client";
import { useRouter } from "next/navigation";
import { Tabs, TabsTrigger } from "@vxture/design-ui";
import { TabsList } from "./business-controls";
import { ATTAINMENT_EVIDENCE, attainmentCoverageHref, type AttainmentEvidence } from "../lib/attainment-workspace";
import { useMessages } from "../lib/i18n/provider";

export function AttainmentEvidenceTabs({ period, scope, planRevision, value, counts }: {
  readonly period: string; readonly scope: string; readonly planRevision?: string | null;
  readonly value: AttainmentEvidence; readonly counts: Record<AttainmentEvidence, number>;
}) {
  const router = useRouter();
  const { ATTAINMENT_DEPLOYMENT_TEXT: T } = useMessages();
  return <Tabs value={value} onValueChange={evidence => router.push(attainmentCoverageHref({ period, scope, planRevision, evidence: evidence as AttainmentEvidence }), { scroll: false })}>
    <TabsList aria-label={T.evidence}>{ATTAINMENT_EVIDENCE.map(kind => <TabsTrigger key={kind} value={kind}>{T[kind]}<span className="ml-xs tabular-nums text-muted-foreground">{counts[kind]}</span></TabsTrigger>)}</TabsList>
  </Tabs>;
}
