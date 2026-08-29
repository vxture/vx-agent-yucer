// What the bell counts.
//
// The bell had been a dead control since the shell landed: no count was ever
// passed and no click handler existed, so it drew nothing and did nothing -
// while three kinds of work sat waiting in domains the header never asked.
//
// The DECK IS NOT DUPLICATED here, on purpose. The agent dock button already
// carries "N proposals waiting for your decision" and is the copilot's own
// handle; repeating it in the bell would make one fact ring twice. The bell
// aggregates the OTHER waiting work - the kinds that live on ordinary pages a
// member may not have open:
//
//   overdue commitments   promises past their date and unresolved (D4 field)
//   unreviewed closes     closed deals whose win/loss review is owed (D6)
//   downgraded projects   reported health the facts refused (D7)
//
// Counts, not messages: nothing here is a stored notification with a read
// bit. Each number is the CURRENT size of a queue, recomputed per render, and
// clicking through lands on the page that owns the queue. A read-state would
// be a lie without a table behind it.
//
// Each source sits behind its own read gate, and a refusal counts as zero:
// the bell must not become a side channel that leaks how much gated work
// exists to someone who may not see the work itself.

export interface NotificationItem {
  readonly key: "overdue" | "reviews" | "downgraded";
  readonly count: number;
  readonly href: string;
}

export function notificationItems(input: {
  overdueCommitments: number;
  pendingReviews: number;
  downgradedProjects: number;
}): NotificationItem[] {
  const items: NotificationItem[] = [
    { key: "overdue", count: input.overdueCommitments, href: "/account" },
    { key: "reviews", count: input.pendingReviews, href: "/pipeline" },
    { key: "downgraded", count: input.downgradedProjects, href: "/delivery" },
  ];
  // Zero-count queues are omitted entirely: a bell listing three empty queues
  // reads as noise, and the empty state already says "nothing waiting".
  return items.filter((i) => i.count > 0);
}

export function notificationTotal(items: readonly NotificationItem[]): number {
  return items.reduce((n, i) => n + i.count, 0);
}
