import DefaultDeck from "./default";

// The deck for "/" - the home page - when reached by a link.
//
// The catch-all beside it ([...rest]) does not match "/", and a slot with no
// page for a route keeps whatever it last showed on a client-side move (see
// that file). Without this the home page wore the previous page's deck.

export const dynamic = "force-dynamic";

export default DefaultDeck;
