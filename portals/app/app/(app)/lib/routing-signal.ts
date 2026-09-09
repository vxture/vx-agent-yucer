// The one name shared by the two 智能分配 buttons.
//
// The owner's ruling of 2026-09-06 puts the button in TWO places - the routing
// page's title row and the assistant panel - and those live in separate
// parallel routes (`/routing` and `@deck/routing`). They share no React tree,
// so no state and no context can reach across; a window event is the smallest
// thing that lets one button drive the other.
//
// IT IS A NAME, NOT A BUS. Exactly one event, dispatched by the header button
// and listened for by the panel that owns the result. If a second pair ever
// needs this, that is the moment to ask whether the dock should be reachable
// some other way - not the moment to grow this file into an event registry.
export const ROUTING_ANALYSE_EVENT = "yucer:routing-analyse";
