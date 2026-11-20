/** Decode structured draft output without an unbounded whitespace/fence regex. */
export function readAssistantFields(answer: string) {
  let text = answer.trim();
  if (text.startsWith("```")) {
    text = text.slice(3);
    if (text.startsWith("json")) text = text.slice(4);
    if (text.endsWith("```")) text = text.slice(0, -3);
  }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== "object" || !("fields" in raw) || !raw.fields || typeof raw.fields !== "object" || Array.isArray(raw.fields)) return null;
  return {
    fields: raw.fields as Record<string, unknown>,
    message: "message" in raw && typeof raw.message === "string" ? raw.message.trim().slice(0, 1500) : "",
    clearFields: "clearFields" in raw && Array.isArray(raw.clearFields) ? raw.clearFields : [],
  };
}
