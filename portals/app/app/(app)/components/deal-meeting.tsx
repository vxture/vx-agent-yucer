"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Checkbox, Drawer, Icon, SectionHeader, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { explainModelPlaneError, isModelPlaneError } from "../lib/model-plane-error";
import { Tag } from "./tag";
import type { DealMeetingResult } from "../pipeline/meeting-pack-action";

// 商机会前包 in 本单参谋 (deal batch 11a): pick who will be in the room, get
// the rule half (goal, who they are on this deal, open promises - each linking
// back) and, beneath it and labelled as the 参谋's, the agenda, a talk track
// per person, objections and questions. The 参谋's failure never hides the
// rule half.

export function DealMeetingButton({
  opportunityId,
  people,
  onBuild,
}: {
  readonly opportunityId: string;
  /** This deal's people (the chain), to choose from. */
  readonly people: readonly { readonly id: string; readonly name: string; readonly title: string | null }[];
  readonly onBuild: (input: { opportunityId: string; attendeeContactIds: string[] }) => Promise<DealMeetingResult>;
}) {
  const { DEAL_MEETING_TEXT: T, DEAL_MEETING_ERROR, DECISION_ROLE_LABEL, STANCE_LABEL, DIRECTION_LABEL, COPILOT_TEXT, DS_LABELS } = useMessages();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Extract<DealMeetingResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const explain = (code: string) =>
    isModelPlaneError(code) ? explainModelPlaneError(code, COPILOT_TEXT) : (DEAL_MEETING_ERROR[code] ?? DEAL_MEETING_ERROR.unknown ?? code);

  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const build = () =>
    start(async () => {
      setError(null);
      const r = await onBuild({ opportunityId, attendeeContactIds: [...chosen] });
      if (!r.ok) {
        setError(explain(r.error));
        return;
      }
      setResult(r);
    });
  const close = () => {
    setOpen(false);
    setResult(null);
    setError(null);
  };
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {T.open}
      </Button>
      <Drawer
        open={open}
        onClose={close}
        width="md"
        title={T.title}
        description={result ? T.builtNote : T.pickHint}
        closeLabel={DS_LABELS.confirmCancel}
        footer={
          <div className="gap-sm flex items-center justify-end">
            {result ? (
              <Button variant="secondary" onClick={() => setResult(null)}>
                {T.repick}
              </Button>
            ) : (
              <Button disabled={pending || chosen.size === 0} onClick={build}>
                {pending ? T.building : T.build}
              </Button>
            )}
          </div>
        }
      >
        {error ? <p className="text-destructive-text text-body-sm mb-sm">{error}</p> : null}
        {result ? (
          <div className="flex flex-col gap-lg text-body-sm">
            <section className="flex flex-col gap-2xs">
              <SectionHeader level={4} title={T.goal} />
              {result.pack.goal ? (
                <p>
                  {result.pack.goal.criterion}{" "}
                  <span className="text-muted-foreground">
                    {result.pack.goal.from === "current" ? T.goalCurrent(result.pack.goal.stage) : T.goalNext(result.pack.goal.stage)}
                  </span>{" "}
                  <Link href={`/pipeline/${opportunityId}#progress`} className="text-primary hover:underline">
                    {T.goalLink}
                  </Link>
                </p>
              ) : (
                <p className="text-muted-foreground">{T.goalNone}</p>
              )}
            </section>
            <section className="flex flex-col gap-2xs">
              <SectionHeader level={4} title={T.attendees} />
              {result.pack.attendees.map((a) => (
                <div key={a.contactId}>
                  <Link href={`/pipeline/${opportunityId}#buying-roles-panel`} className="text-foreground font-medium hover:underline">
                    {a.name}
                  </Link>
                  {a.title ? <span className="text-muted-foreground"> · {a.title}</span> : null}
                  <span className="ml-xs inline-flex items-center gap-3xs">
                    <Tag>{a.role ? (DECISION_ROLE_LABEL[a.role] ?? a.role) : T.noRole}</Tag>
                    {a.stance ? <Tag>{STANCE_LABEL[a.stance] ?? a.stance}</Tag> : null}
                  </span>
                  <span className="text-muted-foreground"> · {a.lastDays === null ? T.neverContacted : T.lastContact(a.lastDays)}</span>
                </div>
              ))}
            </section>
            <section className="flex flex-col gap-2xs">
              <SectionHeader level={4} title={T.promises} />
              {result.pack.promises.length === 0 ? (
                <p className="text-muted-foreground">{T.promisesNone}</p>
              ) : (
                result.pack.promises.map((p) => (
                  <p key={p.id}>
                    <StatusBadge tone={p.daysToDue < 0 ? "danger" : "warning"}>
                      {p.daysToDue < 0 ? T.overdue(-p.daysToDue) : T.dueIn(p.daysToDue)}
                    </StatusBadge>{" "}
                    <span className="text-muted-foreground">{DIRECTION_LABEL[p.direction] ?? p.direction}</span> {p.statement}
                  </p>
                ))
              )}
            </section>
            <section className="border-border flex flex-col gap-xs rounded-md border border-dashed p-sm">
              <span className="text-foreground flex items-center gap-2xs font-medium">
                <Icon name="sparkles" size="xs" />
                {T.advisorTitle}
              </span>
              {result.advice ? (
                <>
                  {result.advice.agenda.length > 0 ? <AdviceList title={T.agenda} items={result.advice.agenda} ordered /> : null}
                  {result.advice.tracks.length > 0 ? (
                    <div>
                      <p className="text-muted-foreground">{T.tracks}</p>
                      <ul className="flex flex-col gap-2xs">
                        {result.advice.tracks.map((t) => (
                          <li key={t.contactId}>
                            <span className="font-medium">{nameOf.get(t.contactId) ?? t.contactId}</span>：{t.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {result.advice.objections.length > 0 ? <AdviceList title={T.objections} items={result.advice.objections} /> : null}
                  {result.advice.questions.length > 0 ? <AdviceList title={T.questions} items={result.advice.questions} /> : null}
                  {result.advice.dropped > 0 ? <p className="text-muted-foreground">{T.dropped(result.advice.dropped)}</p> : null}
                  {result.cached ? <p className="text-muted-foreground">{T.cached}</p> : null}
                </>
              ) : (
                <p className="text-muted-foreground">{explain(result.adviceError ?? "unknown")}</p>
              )}
            </section>
          </div>
        ) : people.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{T.noPeople}</p>
        ) : (
          <div className="flex flex-col gap-2xs">
            {people.map((c) => (
              <label key={c.id} htmlFor={`deal-attendee-${c.id}`} className="gap-sm hover:bg-muted flex items-center rounded-sm px-2xs py-2xs">
                <Checkbox id={`deal-attendee-${c.id}`} checked={chosen.has(c.id)} onCheckedChange={() => toggle(c.id)} disabled={pending} />
                <span className="text-body-sm grow font-medium">{c.name}</span>
                {c.title ? <span className="text-muted-foreground text-body-sm">{c.title}</span> : null}
              </label>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}

function AdviceList({ title, items, ordered = false }: { readonly title: string; readonly items: readonly string[]; readonly ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <p className="text-muted-foreground">{title}</p>
      <List className={`ml-md ${ordered ? "list-decimal" : "list-disc"}`}>
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </List>
    </div>
  );
}
