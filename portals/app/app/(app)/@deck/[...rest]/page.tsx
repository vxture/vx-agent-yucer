import DefaultDeck from "../default";

// THE DECK FOR EVERY ROUTE THAT HAS NONE OF ITS OWN.
//
// default.tsx is not enough, and the gap is easy to miss because it only shows
// on SOFT navigation. Next.js renders a parallel slot's default.tsx when it
// cannot recover the slot after a full page load; on a client-side move to a
// route the slot has no page for, it KEEPS WHATEVER THE SLOT LAST SHOWED.
//
// So after opening a deal and clicking back to 商机管理 the page was the list
// and the side panel was still that deal's: "本单参谋" for a deal nobody was
// looking at, 问参谋（本单） pointing at it - and 记一笔 still bound to it, so a
// note written on the list was filed on the deal. The same for 客户 (only
// /account/[id] has a deck), for /copilot, for every admin page, and for the
// home page when reached by a link.
//
// A catch-all is a page for EVERY path the slot has no more specific page for
// - static and dynamic segments win over it - so the slot is always matched and
// always re-rendered. Nothing here is new: it is the deck that was already
// everywhere a hard load went.
//
// REQUIRED, not optional ([[...rest]]): an optional catch-all also matches "/"
// and Next refuses to start with it beside the home page ("cannot define a
// route with the same specificity as an optional catch-all"). The home path
// has its own page in this slot, ../page.tsx.

export const dynamic = "force-dynamic";

export default DefaultDeck;
