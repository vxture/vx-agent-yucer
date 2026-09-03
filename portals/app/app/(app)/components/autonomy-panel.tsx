"use client";

import { Card, Icon, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { SaveCell } from "./save-cell";
import { AUTONOMY_MODES, CONFIDENCE_FLOOR, EXECUTABLE_ACTIONS } from "../../domains/copilot/lib/autonomy";

// How much the copilot may do before it asks.
//
// The owner's ruling of 2026-09-01: three postures, not a switch. The setting
// is the third of the three yeses `autopilotAuthorized` has always required -
// tier, permission, and the workspace saying so - and it is the one that never
// had anywhere to live.
//
// EVERY MODE STATES WHAT IT COSTS, not just what it is. "Run unattended" and
// "outreach goes out without you seeing it" are the same sentence, and only one
// of them is a decision somebody can make. This is the one screen in the
// product where a person hands work to a machine, so it is the last place to
// be terse.
//
// THE CURRENT MODE IS NOT PRE-SELECTED IN A CONTROL. Each mode is its own row
// with its own button, so switching is an act with a name rather than a value
// changing under a cursor - the same argument the routing and renewal pages
// make for per-row apply. A radio group would let a stray click hand a machine
// authority nobody meant to give it.

export interface AutonomyPanelProps {
  readonly mode: string;
  /** False when nobody has ever set it - see the service. */
  readonly isSet: boolean;
  readonly decidedBySub: string | null;
  readonly canChange: boolean;
  readonly onChange: (input: { mode: string }) => Promise<{ ok: boolean; error?: string }>;
}

export function AutonomyPanel({
  mode,
  isSet,
  decidedBySub,
  canChange,
  onChange,
}: AutonomyPanelProps) {
  const { AGENT_ACTION_LABEL, AUTONOMY_TEXT, AUTONOMY_ERROR, PROPOSAL_TEXT } = useMessages();

  // NAMED FROM THE LIST, NOT FROM MEMORY. This sentence used to enumerate the
  // auto-performed actions in prose, and it went stale the moment
  // `promote_signal` left EXECUTABLE_ACTIONS - the setting page claimed the
  // agent promoted signals by itself while the queue two inches above marked
  // every one of them "needs a person". Rendering the list is the only version
  // that cannot say the wrong thing.
  const canDo = PROPOSAL_TEXT.joinLabels(
    EXECUTABLE_ACTIONS.map((a) => AGENT_ACTION_LABEL[a] ?? a),
  );

  return (
    <Card className="p-lg">
      <div className="flex flex-col gap-md">
        <div>
          <div className="flex items-center gap-xs">
            <h2 className="text-heading-4 text-foreground">{AUTONOMY_TEXT.title}</h2>
            {/* NOT SET IS ITS OWN STATE, shown rather than smoothed over. A
                workspace sitting at ask_always because nobody chose it and one
                sitting there because somebody did are different facts, and only
                the second is an authorisation. */}
            {isSet ? (
              decidedBySub ? (
                <span className="text-muted-foreground text-body-sm">
                  {AUTONOMY_TEXT.setBy(decidedBySub)}
                </span>
              ) : null
            ) : (
              <StatusBadge tone="warning">{AUTONOMY_TEXT.unset}</StatusBadge>
            )}
          </div>
          <p className="text-muted-foreground mt-2xs text-body-sm">{AUTONOMY_TEXT.why}</p>
        </div>

        <div className="flex flex-col gap-xs">
          {AUTONOMY_MODES.map((m) => {
            const current = m === mode;
            return (
              <div
                key={m}
                className={`flex items-start gap-md rounded-md border p-md ${
                  current ? "border-primary" : "border-border"
                }`}
              >
                <Icon
                  name={current ? "seal-check" : "circle-dashed"}
                  size="sm"
                  className={current ? "text-primary mt-3xs shrink-0" : "text-muted-foreground mt-3xs shrink-0"}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-foreground text-sm">{AUTONOMY_TEXT.modes[m] ?? m}</div>
                  <p className="text-muted-foreground mt-3xs text-body-sm">
                    {AUTONOMY_TEXT.modeWhy[m] ?? ""}
                    {m === "ask_high_risk"
                      ? ` ${canDo ? AUTONOMY_TEXT.modeCanDo(canDo) : AUTONOMY_TEXT.modeCanDoNone}`
                      : ""}
                  </p>
                </div>
                {current ? (
                  <span className="text-muted-foreground shrink-0 text-body-sm">
                    {AUTONOMY_TEXT.saved}
                  </span>
                ) : canChange ? (
                  <SaveCell
                    errors={AUTONOMY_ERROR}
                    label={AUTONOMY_TEXT.save}
                    savedLabel={AUTONOMY_TEXT.saved}
                    onSave={() => onChange({ mode: m })}
                  />
                ) : (
                  <span className="text-muted-foreground shrink-0">-</span>
                )}
              </div>
            );
          })}
        </div>

        {/* WHAT "RISKY" MEANS, on the screen that uses the word. A setting whose
            middle option turns on a rule the reader cannot see is a setting
            they have to trust rather than understand. */}
        <p className="text-muted-foreground text-body-sm">
          {AUTONOMY_TEXT.riskWhy(CONFIDENCE_FLOOR)}
        </p>

        {!canChange ? (
          <p className="text-muted-foreground text-body-sm">{AUTONOMY_TEXT.denied}</p>
        ) : null}
      </div>
    </Card>
  );
}
