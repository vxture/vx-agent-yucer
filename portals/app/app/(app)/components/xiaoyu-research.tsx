"use client";
import { Button, Card, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon } from "@vxture/design-ui";
import { useXiaoyu } from "./xiaoyu-provider";
import { useMessages } from "../lib/i18n/provider";
export function XiaoyuResearch() {
  const { bundle } = useXiaoyu(), { XIAOYU_RESEARCH: T } = useMessages();
  const turns = bundle?.turns.filter(t => t.artifacts && (t.status === "succeeded" || t.status === "failed")) ?? [];
  if (!turns.length) return null;
  return <Card className="p-md"><Collapsible>
    <CollapsibleTrigger asChild><Button variant="ghost" size="md" className="w-full justify-between"><span className="flex items-center gap-sm"><Icon name="link" size="sm" />{T.title}</span><Icon name="chevron-down" size="sm" /></Button></CollapsibleTrigger>
    <CollapsibleContent className="mt-md space-y-md">
      {turns.map(turn => {const a=turn.artifacts!;return <section key={turn.id} className="space-y-sm border-t border-border pt-md">
        <p className="flex flex-wrap gap-x-lg gap-y-xs text-body-small text-muted-foreground"><time dateTime={a.capturedAt}>{new Date(a.capturedAt).toLocaleString()}</time><span>{T.duration}: {(a.usage.elapsedMs/1000).toFixed(1)} s</span><span>{T.tokens}: {a.usage.totalTokens}</span>{!a.failure && <span>{T.calls}: {a.calls.length}</span>}</p>
        {a.failure && <p className="text-body text-muted-foreground">{T.incomplete} {T[a.failure.reason === "tokens" ? "limit_tokens" : a.failure.reason]} {T.modelRequests}: {a.failure.modelRequests} / {T.toolCalls}: {a.failure.toolCalls}</p>}
        {!a.failure && (a.research.length ? a.research.map(s=><div key={s.id} className="space-y-xs text-body"><p className="flex flex-wrap gap-sm"><span>{s.id}</span><span className="text-muted-foreground">{s.capabilityId} {s.operation} {s.version}</span></p><p className="line-clamp-2 break-words text-muted-foreground">{s.excerpt}</p><div className="flex flex-wrap gap-sm">{s.links.map((url,i)=><a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80" title={url}>{T.source} {i+1}</a>)}</div></div>):<p className="text-body text-muted-foreground">{T.noExternal}</p>)}
        <p className="text-body-small text-muted-foreground">{T.scope}</p>
      </section>;})}
    </CollapsibleContent>
  </Collapsible></Card>;
}
