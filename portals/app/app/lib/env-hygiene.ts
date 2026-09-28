// An env value that is only a comment is no value (2026-09-28).
//
// .env.example documents an empty key with an inline comment:
//
//   S2S_CLIENT_ID=                          # default: OIDC_CLIENT_ID
//
// and the host's .env was generated from it. The loader strips an inline
// comment only when it follows a value; with the value empty, the whitespace
// after "=" is trimmed first and the "#" is no longer preceded by a space - so
// the comment BECOMES the value. Production ran with
// S2S_CLIENT_ID="# default: OIDC_CLIENT_ID" and a comment for a client secret,
// and every Atlas / Runos token exchange answered 401 invalid_client, while
// C1 login (whose keys carry real values) worked.
//
// Cleared once at process start, before anything reads them - every key, not
// just the ones found so far: the same shape sits under the job scheduler's
// switches, the webhook rotation secret and the Runos agent version.

/** Delete every entry whose value is a comment. Returns the cleared KEYS (never values). */
export function dropCommentValues(env: Record<string, string | undefined>): string[] {
  const cleared: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.trimStart().startsWith("#")) {
      delete env[key];
      cleared.push(key);
    }
  }
  return cleared.sort();
}

/** One value, read defensively: a comment is empty. */
export function isCommentValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trimStart().startsWith("#");
}
