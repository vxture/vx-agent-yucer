// Where the product sends somebody who needs the platform.
//
// THE INVITE DESTINATION IS NOT IN THE CONTRACT YET, and this file says so
// rather than pretending otherwise. `entitlement/deeplink.ts` is the inherited
// C2 conversion surface and it has exactly one exit - `/subscribe` with intent
// `upgrade | renew | addon`. There is no invite intent and no members path,
// so adding one to that module would be inventing a platform standard inside a
// product repo, which CLAUDE.md forbids: a standard gap is fixed in the
// platform repo first.
//
// So this is deliberately NOT part of the deep-link contract. It is ordinary
// navigation, configured rather than derived, and it returns null when nothing
// is configured - a button that goes nowhere is worse than no button.
//
// When the platform publishes an invite intent, this file goes away and the
// call site moves to subscribeUrl.

/**
 * The console's member administration page, or null when unconfigured.
 *
 * Reads its own variable rather than appending a guessed path to
 * NEXT_PUBLIC_CONSOLE_URL: the console's URL structure is the console's to
 * decide, and a hardcoded `/workspace/members` would be a guess that breaks
 * silently - the link would still render and simply land on a 404.
 */
export function consoleMembersUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_CONSOLE_MEMBERS_URL?.trim();
  return raw ? raw : null;
}
