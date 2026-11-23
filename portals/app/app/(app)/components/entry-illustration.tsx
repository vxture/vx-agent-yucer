import type { EntryPanelState } from "./entry-panel";
import styles from "./public-page.module.css";

/** Decorative spatial motif from the owner-supplied CoSpace v1.3.1 kit. */
export function EntryIllustration({ state }: { readonly state: EntryPanelState }) {
  return <svg className={styles.stateArt} viewBox="0 0 460 255" fill="none" aria-hidden="true">
    <g stroke="currentColor" opacity=".16">{Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${30 + i * 17} ${155 - i * 8}l204 96 M${30 + i * 17} ${155 + i * 8}l204 -96`} />)}</g>
    <g stroke="currentColor" strokeLinejoin="round">
      <path fill="color-mix(in srgb,var(--primary) 8%,var(--card))" strokeOpacity=".55" d="M81 159 232 88l153 71-153 73Z" />
      <path fill="color-mix(in srgb,var(--primary) 8%,var(--card))" strokeOpacity=".55" d="M106 123 232 64l126 59-126 60Z" />
      <path fill="color-mix(in srgb,var(--primary) 8%,var(--card))" strokeOpacity=".55" d="M132 87 232 40l100 47-100 48Z" />
      <path opacity=".48" d="M132 87v48l100 48 100-48V87M232 135v48M182 64v47l100 48M282 64v47l-100 48" strokeDasharray="4 4" />
      <path opacity=".72" d="M155 157l41-19 36 17 54-25 42 20" strokeWidth="1.5" />
      {[[155, 157], [232, 155], [286, 130], [328, 150], [232, 40]].map(([x, y]) => <circle key={`${x}:${y}`} cx={x} cy={y} r="4" fill="var(--card)" strokeWidth="2" />)}
    </g>
    <g transform="translate(167 49)"><rect x="158" y="88" width="42" height="36" rx="12" fill="var(--card)" stroke="currentColor" strokeOpacity=".35" />
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <EntryStateMark state={state} />
      </g>
    </g>
  </svg>;
}

function EntryStateMark({ state }: { readonly state: EntryPanelState }) {
  if (state === "signed-out") return <path d="M170 106h18m-6-6 6 6-6 6" />;
  if (["connecting", "restoring", "checking", "recovery"].includes(state)) return <path d="M186 103a8 8 0 1 0-1 9m2-14v6h-6" />;
  if (state === "unavailable" || state === "unavailableConnection") return <><path d="M172 107a7 7 0 0 1 12-5m-15 10 18-14" /><path d="M185 111h1" /></>;
  if (state === "expired") return <><circle cx="179" cy="106" r="8" /><path d="M179 101v5l4 2" /></>;
  return <><rect x="172" y="104" width="14" height="11" rx="3" /><path d="M175 104v-4a4 4 0 0 1 8 0v4" /></>;
}
