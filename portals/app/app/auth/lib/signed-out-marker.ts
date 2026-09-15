// The marker that turns the product root into a sign-out confirmation.
//
// THE PROBLEM IT SOLVES. The IdP's post-logout redirect goes to a URI the
// platform has REGISTERED - for this product `https://yucer.vxture.com/`, the
// product root. That address has no session by definition, so it rendered the
// front door: a deliberate sign-out was answered with "sign in", which reads as
// if the sign-out had failed. Pointing the redirect at a dedicated /signed-out
// route would be the obvious fix and is not available to the product: the URI
// is registered on the platform side and changing it is a platform change.
//
// SO THE PRODUCT LEAVES ITSELF A NOTE. /auth/logout sets this cookie on the way
// out; the layout's session-less branch reads it and renders the confirmation
// instead of the door. It is not a session, carries no identity and grants
// nothing - its entire content is the string "1".
//
// CONSUMED ON FIRST RENDER. The confirmation clears the cookie from the client
// as it mounts, so it shows exactly once: the next address the reader opens is
// the front door again, which is what they should see. The short max-age is the
// backstop for a reader who never arrives - a browser closed at the IdP, say -
// rather than the mechanism.

export const SIGNED_OUT_COOKIE = "yucer_signed_out";

/** Two minutes: long enough for the IdP round trip, short enough that an
 *  abandoned logout cannot colour a visit half an hour later. */
export const SIGNED_OUT_MAX_AGE_SECONDS = 120;
