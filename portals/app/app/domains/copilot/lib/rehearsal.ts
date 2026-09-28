// 预演 (deal batch 11c, YC-066 S6 / YC-070): rehearse a conversation on one
// deal - an objection, a negotiation, "what if the economic buyer changes" -
// with the model playing the buyer's side from what the deal's notes say.
//
// "推演产出标「推演」，不出现在任何判断、提案或预测里": the frame tells the
// model so, and the turn admits no proposal whatever it answers
// (admitProposal: () => false in the ask action). The frame is `framing`,
// never stored as the member's message.

export const REHEARSAL_MARK = "[rehearsal]";

export function rehearsalFrame(dealName: string): string {
  return [
    `${REHEARSAL_MARK} This is a rehearsal (a role-play) for the deal "${dealName}".`,
    `Play the buyer's side as the deal's notes describe the people and their concerns, and stay in role;`,
    `when the member steps out of role to ask for feedback, give it plainly.`,
    `Nothing said here is a judgement, a proposal or a forecast: do not propose actions or record anything.`,
    `Do not invent facts the notes do not contain; if the notes are silent, say the buyer has not said.`,
  ].join("\n");
}

/**
 * A session a member started by asking - not one a 参谋 run opened, and not a
 * rehearsal. Every advisor question and every rehearsal title begins with its
 * mark ("[plan-draft] ...", "[rehearsal] ..."), so /copilot resumes the
 * member's own latest conversation instead of whatever ran last on their
 * behalf (found 2026-09-28: a 会前包 run became the chat /copilot opened on).
 */
export function isMemberConversation(title: string | null): boolean {
  return !/^\[[a-z-]+\]/.test(title ?? "");
}
