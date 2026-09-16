// access_token's `phone` claim arrives E.164-ish (+8618092907523, seen live)
// - a country code prefix with no separators. tenderforge's own reference
// screen (2026-09-16, owner: "参考我给的页面，使用 3 4 4 分段电话") drops the
// +86 and groups the remaining 11 digits 3-4-4 ("180 9290 7523"), the
// conventional grouping for a Chinese mobile number.
//
// Verbatim on anything that doesn't match that exact shape - a landline, an
// international number, or a claim shape the platform changes later - rather
// than mangling a phone number this cannot confidently parse.

export function formatPhone(raw: string): string {
  const digits = raw.replace(/^\+86/, "");
  if (!/^\d{11}$/.test(digits)) return raw;
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
}
