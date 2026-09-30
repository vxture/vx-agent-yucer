import type { MemberSighting } from "./store";
import { formatPhone } from "../(app)/lib/format-phone";

// THE MEMBER'S DISPLAY CACHE (incr/0103). What the platform releases on each
// member's own access token - name, face, phone, email, and (once it is on the
// token) user_no - kept on local_authz.member so a roster can show people who
// are not the one signed in. Never authoritative: refreshed on that member's
// next sighting, stale until then.
//
// No database here on purpose: the roster's client components import
// memberIdLine, and the stores import profileChanges.

export const MEMBER_PROFILE_FIELDS = ["displayName", "avatarHash", "phone", "email", "userNo", "pictureUrl"] as const;
type ProfileField = (typeof MEMBER_PROFILE_FIELDS)[number];
type Profile = Partial<Record<ProfileField, string | null>>;

/** The supplied fields that differ from what is cached - empty means no write.
 *  A field the sighting did not supply is left alone, never blanked. */
export function profileChanges(m: MemberSighting, cached: Profile): Profile {
  const out: Profile = {};
  for (const f of MEMBER_PROFILE_FIELDS) {
    const v = m[f];
    if (v !== undefined && v !== (cached[f] ?? null)) out[f] = v;
  }
  return out;
}

/** user_no as people read it: T-1234567890. The platform's value is the ten
 *  digits; one that already carries a prefix is shown as it is. */
export function formatUserNo(userNo: string): string {
  return /^[0-9]+$/.test(userNo) ? `T-${userNo}` : userNo;
}

/**
 * THE ONE LINE UNDER A NAME (owner, 2026-09-29): phone, else email, else
 * user_no - the first the member has, one only. Null when none is known; the
 * sub is never offered as a substitute (it is what this replaced).
 */
export function memberIdLine(m: {
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly userNo?: string | null;
}): string | null {
  // As people write it here: no +86, 3-4-4 (owner: 所有显示电话，不要+86 前缀).
  if (m.phone) return formatPhone(m.phone);
  if (m.email) return m.email;
  if (m.userNo) return formatUserNo(m.userNo);
  return null;
}
