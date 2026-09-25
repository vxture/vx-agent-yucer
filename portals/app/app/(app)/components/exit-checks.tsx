import { Tag } from "./tag";
import { getMessages } from "../lib/i18n/server";
import type { CheckDetail, StageCheck } from "../../domains/pipeline/lib/exit-criteria";

// 推进进程 · 本阶段退出条件 (incr/0087, YC-069 §06): one line per criterion -
// its status, and in a few words why, pointing at the panel that owns the
// detail rather than repeating it ("1 行待批 -> 报价与审批").

const REASON_SLOTS = new Set(["pain", "metrics", "status_quo"]);

export async function ExitChecks({
  check,
  filledSlots,
}: {
  readonly check: StageCheck;
  /** Which slots are written - a met slot criterion says so, an unmet one points at its panel. */
  readonly filledSlots: ReadonlySet<string>;
}) {
  const { DEAL_PAGE_TEXT, DECISION_ROLE_LABEL } = await getMessages();
  if (check.total === 0) return <p className="text-muted-foreground text-body-sm">{DEAL_PAGE_TEXT.exitNone}</p>;
  const roles = (r: readonly string[]) =>
    r.length === 0 ? DEAL_PAGE_TEXT.exitAnyone : r.map((x) => DECISION_ROLE_LABEL[x] ?? x).join(" / ");
  const why = (d: CheckDetail): { text: string; href?: string } => {
    switch (d.kind) {
      case "role_present":
        return d.holders > 0
          ? { text: DEAL_PAGE_TEXT.exitHolders(d.holders) }
          : { text: DEAL_PAGE_TEXT.exitNoRole(roles(d.roles)), href: "#buying-roles-panel" };
      case "role_reached":
        return d.lastDays === null
          ? { text: DEAL_PAGE_TEXT.exitNeverReached(roles(d.roles)), href: "#comms" }
          : d.lastDays <= d.days
            ? { text: DEAL_PAGE_TEXT.exitReached(d.lastDays) }
            : { text: DEAL_PAGE_TEXT.exitReachedLate(d.lastDays, d.days), href: "#comms" };
      case "slot_filled":
        return filledSlots.has(d.slot)
          ? { text: DEAL_PAGE_TEXT.exitWritten }
          : REASON_SLOTS.has(d.slot)
            ? { text: DEAL_PAGE_TEXT.exitGoTo(DEAL_PAGE_TEXT.reasonsTitle), href: "#reasons" }
            : { text: DEAL_PAGE_TEXT.exitGoTo(DEAL_PAGE_TEXT.decisionTitle), href: "#buying-roles-panel" };
      case "lines_priced":
        return d.count === 0
          ? { text: DEAL_PAGE_TEXT.exitNoLines, href: "#quote" }
          : d.pending > 0
            ? { text: DEAL_PAGE_TEXT.exitPendingLines(d.pending), href: "#quote" }
            : { text: DEAL_PAGE_TEXT.exitPriced(d.count) };
      case "their_commitments_clear":
        return d.overdue > 0 ? { text: DEAL_PAGE_TEXT.exitOverdue(d.overdue), href: "#change-history" } : { text: DEAL_PAGE_TEXT.exitNoOverdue };
      case "close_date_valid":
        return d.daysLeft === null
          ? { text: DEAL_PAGE_TEXT.exitNoDate }
          : d.daysLeft >= 0
            ? { text: DEAL_PAGE_TEXT.exitDaysLeft(d.daysLeft) }
            : { text: DEAL_PAGE_TEXT.exitDatePassed(-d.daysLeft) };
      case "unreadable":
        return { text: DEAL_PAGE_TEXT.exitUnreadable };
    }
  };
  return (
    <ol className="divide-primary/10 dark:divide-primary/20 flex flex-col divide-y divide-dashed">
      {check.checks.map((c) => {
        const w = why(c.detail);
        return (
          <li key={c.criterion.id} className="flex items-start gap-sm py-2xs text-body-sm">
            <span className="w-16 flex-none">
              <Tag tone={c.status === "met" ? "success" : c.status === "unmet" ? "warning" : "neutral"}>
                {c.status === "met" ? DEAL_PAGE_TEXT.exitMet : c.status === "unmet" ? DEAL_PAGE_TEXT.exitUnmet : DEAL_PAGE_TEXT.exitUnknown}
              </Tag>
            </span>
            <span className="text-foreground min-w-0 flex-1">{c.criterion.name}</span>
            {w.href ? (
              <a href={w.href} className="text-muted-foreground hover:text-foreground flex-none hover:underline">
                {w.text}
              </a>
            ) : (
              <span className="text-muted-foreground flex-none">{w.text}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
