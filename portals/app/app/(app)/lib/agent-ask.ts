// The deck's 问参谋: carrying a question from the side panel to the copilot.
//
// The panel does not run a model turn itself. A turn spends the workspace's
// quota and can file proposals, and the person pressing SEND on the copilot
// page is what makes it theirs - the same rule that makes /copilot PREFILL its
// draft and never auto-send (copilot-chat.tsx, initialDraft). So 问参谋 opens
// that page with the question typed so far and the thing the panel is looking
// at as its anchor, which is the form the panel's own 问参谋（本单） link
// already takes.
//
// It was a button that was never wired: disabled on every page, titled "该能力
// 尚未接通", beside a working link that did the same job.

/** What the /copilot page will take of `?ask=` - it cuts anything longer
 *  (copilot/page.tsx). Carrying more would silently lose the end of the
 *  question, so the panel refuses to carry it at all and says so. */
export const ASK_MAX_CHARS = 500;

/** What the panel is looking at - a deal (which implies its customer) or a
 *  customer. Absent on a page that is about neither. */
export interface AskAnchor {
  readonly opportunityId?: string;
  readonly accountId?: string;
}

/**
 * The /copilot URL for a question, or null when there is nothing to send or too
 * much of it. A deal outranks a customer: the copilot page resolves the
 * customer from the deal itself.
 */
export function askHref(text: string, anchor?: AskAnchor): string | null {
  const question = text.trim();
  if (question === "" || question.length > ASK_MAX_CHARS) return null;
  const params = new URLSearchParams();
  if (anchor?.opportunityId) params.set("opportunity", anchor.opportunityId);
  else if (anchor?.accountId) params.set("account", anchor.accountId);
  params.set("ask", question);
  return `/copilot?${params.toString()}`;
}

/** How far over the limit a question is - 0 when it fits. */
export function askOverBy(text: string): number {
  return Math.max(0, text.trim().length - ASK_MAX_CHARS);
}
