"use client";

import { useState } from "react";
import { SegmentedControl } from "@vxture/design-ui";
import { DEFAULT_LOCALE } from "@vxture/shared";
import { MessagesProvider } from "../../(app)/lib/i18n/provider";
import { SignIn } from "../../(app)/components/sign-in";
import { SignedOut } from "../../(app)/components/signed-out";
import { NoSubscription } from "../../(app)/components/no-subscription";
import { NoRoles } from "../../(app)/components/no-roles";
import { subscribeUrl } from "../../entitlement/deeplink";
import { GATE_PREVIEW_TEXT } from "../../(app)/lib/messages";

// The three gate screens, side by side, with no session and no platform.
//
// WHY A PREVIEW ROUTE AT ALL. Each of the four answers a DIFFERENT absence -
// no session, no subscription, no role, a session just ended - so seeing them
// in the product means arranging four states that are mutually exclusive by
// construction. Locally two of them also need the dev-session switch in
// opposite positions, which is a server restart between screens.
//
// Same pattern and same limits as the entitlement-matrix and product-preview
// pages next to it: fixtures only, no session, no database, and it makes
// `next build` exercise all three rather than only the one the current
// environment happens to reach.

export const dynamic = "force-static";

type Screen = "sign-in" | "no-subscription" | "no-roles" | "signed-out";

export default function GateScreensPreview() {
  const [screen, setScreen] = useState<Screen>("sign-in");

  return (
    <MessagesProvider locale={DEFAULT_LOCALE}>
      {/* Floats over the screen being reviewed rather than pushing it down:
          each of the three is a full viewport, and a picker in the flow above
          them would mean none of them is ever seen at the size it ships at.
          AT THE BOTTOM, because the top is where the product puts its own
          brand lockup - on a phone the two collided. */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-sm">
        <div className="bg-card/90 border-border gap-sm p-xs flex items-center rounded-full border shadow-sm backdrop-blur">
          <SegmentedControl
            size="sm"
            ariaLabel={GATE_PREVIEW_TEXT.ariaLabel}
            value={screen}
            onChange={setScreen}
            items={[
              { value: "sign-in", label: GATE_PREVIEW_TEXT.signIn },
              { value: "no-subscription", label: GATE_PREVIEW_TEXT.noSubscription },
              { value: "no-roles", label: GATE_PREVIEW_TEXT.noRoles },
              { value: "signed-out", label: GATE_PREVIEW_TEXT.signedOut },
            ]}
          />
        </div>
      </div>

      {screen === "sign-in" && <SignIn />}
      {screen === "no-subscription" && (
        <NoSubscription
          // The intent a never-subscribed workspace calls for, from the same
          // constructor the layout uses - not a hand-written URL.
          subscribeHref={subscribeUrl({ intent: "subscribe" })}
          userName={GATE_PREVIEW_TEXT.sampleUser}
          workspaceLabel={GATE_PREVIEW_TEXT.sampleWorkspace}
        />
      )}
      {screen === "no-roles" && (
        <NoRoles
          userName={GATE_PREVIEW_TEXT.sampleUser}
          workspaceLabel={GATE_PREVIEW_TEXT.sampleWorkspace}
        />
      )}
      {screen === "signed-out" && <SignedOut consoleHref="https://console.vxture.com" />}
    </MessagesProvider>
  );
}
