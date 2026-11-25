const COMPLETION = /\u5df2(?:\u7ecf)?(?:\u6210\u529f)?(?:\u4fdd\u5b58|\u53d1\u5e03|\u63d0\u4ea4|\u521b\u5efa)|successfully (?:saved|published|submitted|created)/i;
const AGENT_CLAIMS = [
  /(?:\u6211(?:\u4eec)?|\u5c0f\u807f|\u672c\u8f6e|\u672c\u6b21|\u8fd9\u6b21)\u5df2(?:\u7ecf)?(?:\u6210\u529f)?(?:\u4fdd\u5b58|\u53d1\u5e03|\u63d0\u4ea4|\u521b\u5efa)/,
  /\u5df2\u4e3a[\u4f60\u60a8](?:\u6210\u529f)?(?:\u4fdd\u5b58|\u53d1\u5e03|\u63d0\u4ea4|\u521b\u5efa)/,
  /\b(?:I|we)\s+(?:(?:have|has|just|already|successfully)\s+){0,3}(?:saved|published|submitted|created)\b/i,
];
const agentClaim = (text: string) => AGENT_CLAIMS.some(pattern => pattern.test(text));
const SUCCESS_CLAIM = /^[\s*#>-]*(?:successfully (?:saved|published|submitted|created)|\u5df2(?:\u7ecf)?\u6210\u529f(?:\u4fdd\u5b58|\u53d1\u5e03|\u63d0\u4ea4|\u521b\u5efa))/i;

interface AnswerState { forms: number; verifiedReceipt: boolean; finalized?: boolean; truncated?: boolean }
function operationStatus(state: AnswerState) {
  if (state.verifiedReceipt) return "\u672c\u8f6e\u64cd\u4f5c\u6838\u9a8c\uff1a\u5df2\u8bfb\u53d6\u73b0\u6709\u6267\u884c\u56de\u6267\uff0c\u5b9e\u9645\u4fdd\u5b58\u6216\u53d1\u5e03\u72b6\u6001\u8bf7\u4ee5\u6267\u884c\u6e05\u5355\u4e3a\u51c6\u3002";
  if (state.forms) return `\u672c\u8f6e\u64cd\u4f5c\u6838\u9a8c\uff1a\u5df2\u51c6\u5907 ${state.forms} \u4efd\u5f85\u590d\u6838\u8868\u5355\uff0c\u672a\u4fdd\u5b58\u6216\u53d1\u5e03\u4e1a\u52a1\u8bb0\u5f55\u3002`;
  return "\u672c\u8f6e\u64cd\u4f5c\u6838\u9a8c\uff1a\u672a\u751f\u6210\u8868\u5355\u8349\u7a3f\uff0c\u672a\u4fdd\u5b58\u6216\u53d1\u5e03\u4e1a\u52a1\u8bb0\u5f55\u3002";
}

/** Server-owned status must not erase analysis that describes existing records.
 * Explicit first-person completion claims are corrected locally; ambiguous
 * record-state wording gets an authoritative status, not a blanket rewrite.
 * This is presentation defence, never authorization or an execution receipt. */
export function taskAnswer(answer: string, state: AnswerState) {
  const needsStatus = state.finalized || COMPLETION.test(answer) || agentClaim(answer);
  if (needsStatus) {
    // Clause boundaries preserve the rest of a paragraph, Markdown tables,
    // cited record statuses and recommendations when one claim is wrong.
    answer = answer.split(/(?<=[\u3002\uff01\uff1f\uff0c,;\uff1b\n])|(?<=[.!?])\s+/u)
      .filter(clause => !(agentClaim(clause) || SUCCESS_CLAIM.test(clause)) || /\b(?:not|never|haven't|hasn't|didn't|no)\b/i.test(clause)).join("").trim();
    const status = operationStatus(state);
    answer = answer ? `${status}\n\n${answer}` : status;
  }
  if (state.truncated) answer += "\n\n\u672c\u8f6e\u5df2\u6536\u655b\u540e\u7eed\u67e5\u8be2\uff0c\u4ee5\u4e0a\u7ed3\u8bba\u4ec5\u8986\u76d6\u5df2\u6838\u5bf9\u4fe1\u606f\uff1b\u672a\u8bfb\u53d6\u7684\u5185\u5bb9\u4e0e\u7f3a\u5931\u5b57\u6bb5\u4ecd\u9700\u8865\u5145\u3002";
  return answer;
}
