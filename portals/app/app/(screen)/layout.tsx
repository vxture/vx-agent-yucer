import type { ReactNode } from "react";
import { resolveLocale } from "../(app)/lib/i18n/locale";
import { MessagesProvider } from "../(app)/lib/i18n/provider";

// 展示大屏 route group.
//
// ITS OWN GROUP BECAUSE IT MUST NOT WEAR THE SHELL. `(app)/layout.tsx` wraps
// every page in AppShell - navigation rail, board, agent dock, header - which is
// exactly right for a page somebody works in and exactly wrong for a screen
// hanging on a wall. A situation screen is read from three metres by people who
// are not driving it; a nav rail there is chrome nobody can reach and a header
// repeating the workspace name is a line of the display spent on nothing.
//
// It still sits INSIDE the product: same root layout, same provider stack, same
// session, same services, same two gates. The only thing this group drops is the
// shell. It is not a second application and it does not get a second copy of
// anything - the page below reads the same stores /pipeline and /delivery read.
//
// The locale provider IS kept. Every string on the screen is Chinese copy from
// the message dictionary, and a screen that fell back to the default locale
// while the rest of the product followed the reader's would be the one surface
// that ignores the setting.

export default async function ScreenLayout({ children }: { readonly children: ReactNode }) {
  const locale = await resolveLocale();
  return <MessagesProvider locale={locale}>{children}</MessagesProvider>;
}
