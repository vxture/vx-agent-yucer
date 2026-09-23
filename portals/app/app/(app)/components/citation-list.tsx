"use client";

import { SectionHeader, Stack } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type { Citation } from "../../domains/judgement/lib/judgement";

// 判断到证据跳转 (YC-021 底座): ANY judgement can be opened to the rows it
// cites. This used to live inside the home screen's drawer only, so the same
// judgement shown on the customer page or the deal page carried its claim and
// rule but not what it rested on. One component, three callers, one wording.
//
// Verbatim, and all of them. Everything downstream cites these rows, so what a
// reader can open must be what was cited - a tidied summary would make
// provenance a story.
export function CitationList({
  citations,
}: {
  readonly citations: readonly Citation[];
}) {
  const { CHANNEL_LABEL, HOME_TEXT } = useMessages();
  if (citations.length === 0) return null;
  return (
    <section className="bg-muted/40 border-border rounded-md border p-sm">
      <SectionHeader level={4} title={HOME_TEXT.secEvidenceCount(citations.length)} />
      <Stack gap="sm" className="mt-xs">
        {citations.map((c, i) => (
          <blockquote key={i} className="border-primary/40 max-w-[62ch] border-l-2 pl-sm">
            {/* Composed here, from parts. The rule used to hand down one
              finished string and the raw channel enum and subject id went
              straight to the screen - "58 天前 · call · usr_demo_rep" - with
              no layer left that could label them.

              The actor is a NAME when the page resolved one (nameCitations -
              the member directory); an actor it could not resolve stays an id
              and is marked as one, because a machine string dressed as a
              person is how a UUID ends up in front of someone. */}
            {c.daysAgo !== undefined ? (
              <cite className="text-muted-foreground flex flex-wrap items-center gap-xs text-body-sm not-italic tabular-nums">
                <span>
                  {HOME_TEXT.citedBy(
                    c.daysAgo,
                    c.channel ? (CHANNEL_LABEL[c.channel] ?? c.channel) : "",
                  )}
                </span>
                {c.actorName ? (
                  <span>{c.actorName}</span>
                ) : c.actorSub ? (
                  <span className="font-mono">{c.actorSub}</span>
                ) : null}
              </cite>
            ) : null}
            <p className="text-muted-foreground text-body-sm leading-relaxed">{c.text}</p>
          </blockquote>
        ))}
      </Stack>
    </section>
  );
}
