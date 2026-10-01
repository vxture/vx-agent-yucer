// What the deck says after 记一笔.
//
// The button used to do `if (r.ok) setText("")`: success cleared the box and
// said nothing, and a refusal did NOTHING - the note stayed in the box, no
// message, no sign it had been tried. reachable-codes.test.ts exists because
// "a refused action looked exactly like a successful one" is a defect class
// this product has found before; the deck was another instance of it.

export interface CaptureResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface CaptureFeedback {
  readonly tone: "success" | "danger";
  readonly title: string;
  /** Whether the box is emptied. A note that was NOT saved stays where it is. */
  readonly clear: boolean;
}

/**
 * The toast for a result. `errors` is the dictionary that explains the codes a
 * follow-up record can come back with (FIELD_ERROR); a code it does not know
 * gets its generic `denied` sentence, never the raw code.
 */
export function captureFeedback(
  result: CaptureResult,
  errors: Readonly<Record<string, string>>,
  saved: string,
): CaptureFeedback {
  if (result.ok) return { tone: "success", title: saved, clear: true };
  return {
    tone: "danger",
    title: errors[result.error ?? "denied"] ?? errors.denied ?? saved,
    clear: false,
  };
}
