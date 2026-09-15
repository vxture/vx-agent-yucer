// The public site, for the header's one outward link.
//
// Configured rather than hardcoded, and shaped exactly like consoleUrl() next
// to it: a product repo does not get to decide the company's address, and an
// empty value is a deliberate "no link" rather than a fallback. Unset means the
// default, so a stack that never declares it still links somewhere real.

export function websiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_WEBSITE_URL;
  if (raw === "") return null;
  return (raw ?? "https://vxture.com").replace(/\/$/, "");
}
