"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../(app)/lib/i18n/provider";
import { CHINA } from "../lib/china-geometry";
import {
  rollUpByProvince,
  totalOf,
  type DealLike,
  type InstalmentLike,
  type LeadLike,
  type MilestoneLike,
  type ProjectLike,
  type ProposalLike,
  type ProvinceRollup,
} from "../lib/rollup";
import { anchorOf, periodsFor, type PeriodKey } from "../lib/period";
import type { EntryKey } from "../lib/entry";
import { shortProvince } from "../../domains/shared/provinces";
import {
  AdoptionTrend, Bars, CashChart, HealthDonut, Ring, StageChart,
} from "./screen-charts";
import { ScreenHex } from "./screen-hex";
import { ScreenTools } from "./screen-tools";
import "./national-screen.css";

// 全国销售态势屏 - the display itself.
//
// WHAT IS AND IS NOT DS HERE. Every colour, radius and spacing on this screen is
// a design-token value; nothing is a hand-mixed hex. What the DS has no element
// for is the screen ITSELF: a choropleth of China, a honeycomb ground, and the
// bracket toggles that fold the rails. Those are registered as TD-025 rather
// than quietly built - see the entry for the missing element, the stopgap
// location and the recovery condition.
//
// THREE LEVELS, TWO GESTURES. 全国 -> 大区 -> 省份. The 大区 is chosen from the
// breadcrumb's own dropdown because picking a region off a map means guessing
// which province stands for it; a province is chosen by clicking it. Stepping
// out is bound to three things - right-click, bare canvas, and a button - so
// there is no single small target to hunt for.
//
// EVERY FIGURE COMES FROM rollup.ts. This component formats and draws; it does
// not compute. That split is what lets the arithmetic be tested without
// rendering, and it is why there is no sum in this file.

type Level = "nation" | "region" | "province";
type Metric = "contractValue" | "pipelineValue" | "inDelivery" | "healthRate";

/** The rows the roll-up reads, trimmed on the server to exactly these fields. */
export interface ScreenRows {
  readonly accounts: readonly { id: string; province: string | null }[];
  readonly deals: readonly DealLike[];
  readonly projects: readonly ProjectLike[];
  readonly leads: readonly LeadLike[];
  readonly proposals: readonly ProposalLike[];
  readonly instalments: readonly InstalmentLike[];
  readonly milestones: readonly MilestoneLike[];
}

/**
 * Where each card's 进入 goes, or null when the reader may not go there.
 *
 * KEYED OFF THE CATALOGUE rather than listed again here, so adding a seventh
 * card cannot leave a hole in this map that reads as "no permission".
 */
export type ScreenEntry = Readonly<Record<EntryKey, string | null>>;

export interface NationalScreenProps {
  readonly rows: ScreenRows;
  /** 大区 as this workspace divides its market, in its own order. */
  readonly divisions: readonly { code: string; name: string }[];
  /** province -> 大区 code, from the same source. */
  readonly provinceDivision: Readonly<Record<string, string>>;
  readonly enter: ScreenEntry;
  readonly viewerSub: string;
}

/**
 * Scale a CNY figure and pair it with its unit.
 *
 * THE UNITS ARE COPY, passed in rather than written here. Hard-coding 亿元 in a
 * component is the defect ascii-containment exists to catch, and it is not
 * cosmetic: the English dictionary renders these figures with different
 * suffixes entirely, and a literal would have shown 亿元 to every reader.
 */
function money(v: number, u: { yi: string; wan: string; yuan: string }): { n: string; u: string } {
  if (v >= 100_000_000) return { n: (v / 100_000_000).toFixed(2), u: u.yi };
  if (v >= 10_000) return { n: (v / 10_000).toFixed(1), u: u.wan };
  return { n: Math.round(v).toLocaleString("en-US"), u: u.yuan };
}
const num = (v: number) => Math.round(v).toLocaleString("en-US");

/**
 * Two characters for the avatar, taken from the sub.
 *
 * A sub is `usr_<uuid>`, so its own letters are the only initials there are -
 * inventing a person's to put in the circle is the thing this deliberately
 * does not do.
 */
/**
 * A survival rate between two funnel stages, or null when there is not one.
 *
 * TWO WAYS THERE IS NO RATE, and both print "-" rather than a number:
 *
 * Nothing entered the stage. A division by zero is not 0% - a scope with no
 * pipeline has no conversion INTO contract, and 0% would read as total failure
 * rather than as nothing having arrived yet.
 *
 * ABOVE 100%, WHICH MEANS THE MEASURE DOES NOT APPLY. Under a narrow 统计周期
 * the two stages are not the same cohort: contracts signed this quarter came
 * from pipeline that existed BEFORE it, not from the pipeline still open
 * inside it, so the ratio can exceed one. 2026Q3 read 579.2% - which is not a
 * spectacular quarter, it is a sign that the question does not hold over that
 * window. The same defect as the 130% arrow 在交付 produced, arriving by a
 * different route.
 */
const ratio = (a: number, b: number): number | null => {
  if (b === 0) return null;
  const r = a / b;
  return r > 1 ? null : r;
};

function initialsOf(sub: string): string {
  const body = sub.replace(/^usr[_-]/i, "").replace(/[^a-z0-9]/gi, "");
  return (body.slice(0, 2) || "??").toUpperCase();
}

/**
 * The viewBox that frames a scope.
 *
 * Squared to the arena's aspect around the scope's OWN centre, so a tall
 * province and a wide one both land in the middle rather than one of them
 * sitting against an edge. Falls back to the national box whenever the scope
 * has no drawable shape in it - an empty box would collapse the viewBox to
 * zero width and blank the map.
 */
function frameFor(level: Level, scope: readonly ProvinceRollup[]) {
  if (level === "nation") return CHINA.viewBox;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of scope) {
    const b = CHINA.provinces[p.province]?.bbox;
    if (!b) continue;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[0] + b[2]); y1 = Math.max(y1, b[1] + b[3]);
  }
  if (!Number.isFinite(x0)) return CHINA.viewBox;
  const w = x1 - x0, h = y1 - y0, pad = 0.5;
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const aspect = 1.45;
  let vw = w * (1 + pad), vh = h * (1 + pad);
  if (vw / vh < aspect) vw = vh * aspect; else vh = vw / aspect;
  return [cx - vw / 2, cy - vh / 2, vw, vh] as const;
}

/* --- 板块 - the design's module, exactly ------------------------------------
   A header of four parts (ring, title, step, rule), then a body that holds a
   row of cells and a chart which takes the space that is left. The right rail
   reverses the header, so the rule always runs toward the map. */

function Mod(
  { step, title, right, href, enterLabel, children }:
  {
    step: string; title: string; right?: boolean;
    href?: string | null; enterLabel: string;
    children: React.ReactNode;
  },
) {
  return (
    <section className="mod">
      <div className={`mod-hd${right ? " rev" : ""}`}>
        <Ring />
        <h2>{title}</h2>
        <span className="step">{step}</span>
        <span className="rule" />
        {/* AT THE OTHER END OF THE TITLE ROW, and symmetric without being
            positioned twice: it comes after the rule in DOM order, and the
            right rail's header is row-reverse, so the same markup puts it at
            the far right on the left rail and the far left on the right one.
            Null when the reader may not open that page - a disabled entry
            point is not information, it is an advertisement for a refusal. */}
        {href ? (
          <Link className="enter" href={href} aria-label={`${enterLabel} ${title}`}>
            {enterLabel}
            <svg viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M3.4 2 L6.6 5 L3.4 8" stroke="currentColor" strokeWidth="1.4"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : null}
      </div>
      <div className="mod-bd">{children}</div>
    </section>
  );
}

/** Three readings across one line, the first of them the panel's lead. */
function Cells({ children }: { children: React.ReactNode }) {
  return <div className="cells">{children}</div>;
}

function Cell(
  { k, v, unit, tone }:
  { k: string; v: string; unit?: string; tone?: "lead" | "amber" | "red" | "hi" },
) {
  return (
    <div>
      <div className="k">{k}</div>
      <div className={`v${tone ? ` ${tone}` : ""}`}>
        {v}{unit ? <small>{unit}</small> : null}
      </div>
    </div>
  );
}

/**
 * The fold bracket - vxtpl's own graphic, one asset, mirrored.
 *
 * Both brackets drive the SAME state, so either click folds and unfolds both
 * rails together: they are one gesture, not two independent panels.
 */
/**
 * The connector between two stages: an arrow, and what survived across it.
 *
 * A DIVISION BY ZERO IS NOT 0%. A scope with no pipeline has no conversion
 * INTO contract - the rate does not exist - and printing 0% there would read
 * as total failure rather than as nothing having entered the funnel yet.
 */
function Conv({ rate }: { rate: number | null }) {
  return (
    <div className="conv">
      <svg viewBox="0 0 52 9" aria-hidden>
        <path d="M0 4.5 H44 M38 1 L44 4.5 L38 8" fill="none"
              stroke="var(--screen-accent)" strokeWidth="1.2" opacity=".75" />
      </svg>
      <span>{rate === null ? "-" : `${(rate * 100).toFixed(1)}%`}</span>
    </div>
  );
}

function FoldArc(
  { side, folded, lit, onToggle, onHover, label }:
  {
    side: "left" | "right"; folded: boolean; lit: boolean;
    onToggle: () => void; onHover: (on: boolean) => void; label: string;
  },
) {
  // Flipped on the right; folding flips it again, so the bracket always points
  // the way the rail is ABOUT to move rather than the way it came.
  const flip = (side === "right") !== folded;
  return (
    <button
      type="button"
      className={`arc arc-${side}${lit ? " lit" : ""}`}
      aria-expanded={!folded}
      aria-label={label}
      onClick={onToggle}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <span className={`arc__art${flip ? " arc__art--flip" : ""}`} aria-hidden />
    </button>
  );
}

export function NationalScreen(
  { rows, divisions, provinceDivision, enter, viewerSub }: NationalScreenProps,
) {
  const { SCREEN_TEXT } = useMessages();
  const units = {
    yi: SCREEN_TEXT.unitYi, wan: SCREEN_TEXT.unitWan, yuan: SCREEN_TEXT.unitYuan,
  };
  const cash = (v: number) => money(v, units);
  const [level, setLevel] = useState<Level>("nation");
  // A DIVISION CODE, not a name: the tenant may rename a division, and a
  // selection stored by name would silently unselect itself when they did.
  const [region, setRegion] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("contractValue");
  const [menuOpen, setMenuOpen] = useState(false);
  const [railsFolded, setRailsFolded] = useState(false);
  const [titleFolded, setTitleFolded] = useState(false);
  // One flag for both brackets: they are one control with two handles.
  const [arcLit, setArcLit] = useState(false);

  /* 省份信息面板. It follows the pointer over the map and carries the five
     figures a reader is actually comparing provinces on.
     A NATIVE <title> IS NOT THIS. That is what the map had: a browser tooltip
     that waits about a second, renders in the OS font on a white chip, cannot
     hold five rows, and never appears at all on a touch screen. It reads as
     nothing having been built. */
  // x and y are the FINAL position, already fitted to the map's box.
  const [tip, setTip] = useState<{ p: ProvinceRollup; x: number; y: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  /* The panel's measured size, remembered between hovers.
     IT IS THE SAME PANEL EVERY TIME - one title and five rows - so one
     measurement serves every province. The fallback is only ever used for the
     very first hover of a session, and is deliberately generous: over-
     estimating flips the panel a few pixels early, under-estimating lets it
     off the edge, and only the second is a defect. */
  const tipSize = useRef({ w: 190, h: 155 });

  const menuRef = useRef<HTMLSpanElement>(null);

  /* DISMISSING THE 大区 MENU, for a keyboard as well as a mouse.
     This used to be an onClick on the root <div>, which is a handler a keyboard
     can never fire: with no pointer there was no way to close the menu at all,
     and the swallow-the-click <span> around it existed only to stop that same
     handler. Escape closes it and returns focus to the trigger, a pointer
     landing outside closes it, and neither depends on an element pretending to
     be interactive. The listeners exist only while it is open. */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /* 本年度 by default (owner), not 全部. A screen that opens on every deal the
     workspace has ever done answers a question nobody walked up to it to ask;
     the year is the window a national review is actually held over. 全部 stays
     one click away. */
  const [periodKey, setPeriodKey] = useState<PeriodKey>("year");
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef<HTMLSpanElement>(null);

  /* THE CLOCK IS RESOLVED AFTER MOUNT, not during the server render. The
     period list is built from the current year and the rolling chart windows
     are measured back from now; stamping the server's clock into the HTML
     would put its day into the markup and then disagree with the client's -
     a hydration mismatch, and on a screen left running overnight, a period
     list that silently goes stale. Null until then, and the roll-up simply
     waits: rendering against a guessed date would be worse than rendering a
     moment late. */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const stamp = () => setNow(new Date());
    stamp();
    const t = setInterval(stamp, 60_000);
    return () => clearInterval(t);
  }, []);

  const periods = useMemo(
    () => periodsFor(now ?? new Date(0), {
      all: SCREEN_TEXT.periodAll,
      year: SCREEN_TEXT.periodYear,
      quarter: SCREEN_TEXT.periodQuarter,
    }),
    [now, SCREEN_TEXT],
  );
  const period = periods.find((p) => p.key === periodKey) ?? periods[0]!;

  /* THE ROLL-UP RUNS HERE, so changing the period re-counts everything
     without a round trip. Same pure function the tests cover; the only thing
     that moved is where it is called. */
  const rollup = useMemo(
    () => rollUpByProvince(
      rows.accounts as never,
      rows.deals,
      rows.projects,
      {
        leads: rows.leads,
        proposals: rows.proposals,
        instalments: rows.instalments,
        milestones: rows.milestones,
        provinceDivision,
        period,
        // The rolling strips end where the period does, so 近 12 期 under a
        // past quarter reads against that quarter rather than into weeks it
        // excludes and drawing nothing.
        now: anchorOf(period, now ?? new Date()),
      },
    ),
    [rows, provinceDivision, period, now],
  );

  /* Dismissing the period menu, for a keyboard as well as a mouse - the same
     contract the 大区 menu keeps. */
  useEffect(() => {
    if (!periodOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!periodRef.current?.contains(e.target as Node)) setPeriodOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPeriodOpen(false);
      periodRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [periodOpen]);

  const byName = useMemo(
    () => new Map(rollup.provinces.map((p) => [p.province, p])),
    [rollup],
  );

  const scope: readonly ProvinceRollup[] = useMemo(() => {
    if (level === "province" && province) {
      const one = byName.get(province);
      return one ? [one] : [];
    }
    if (level === "region" && region) return rollup.byDivision.get(region) ?? [];
    return rollup.provinces;
  }, [level, region, province, rollup, byName]);

  const divisionName = (code: string | null) =>
    code === null ? null : divisions.find((d) => d.code === code)?.name ?? null;

  /* WHAT THIS SCREEN IS CURRENTLY LOOKING AT, in one place. The title and the
     breadcrumb are the same statement in two typefaces, so they read it from
     here rather than each assembling their own - which is how they came to
     disagree, one saying 广东省 while the other said 广东. */
  const scopeName =
    level === "province" && province ? shortProvince(province)
    : level === "region" ? divisionName(region) ?? SCREEN_TEXT.nation
    : SCREEN_TEXT.nation;

  const total = useMemo(() => totalOf(scope), [scope]);
  const inScope = useMemo(() => new Set(scope.map((p) => p.province)), [scope]);

  const readMetric = (p: ProvinceRollup): number | null =>
    metric === "healthRate" ? p.healthRate : p[metric];

  // The ramp is graded over the CURRENT scope, so drilling into a region
  // re-grades against that region rather than leaving every province in it the
  // same shade it had nationally.
  /* THE RAMP IS GRADED OVER PROVINCES THAT HAVE SOMETHING, and zero is not
     something. Including the empty ones dragged `lo` to 0 in every metric, so
     the whole country was graded against a floor nobody occupies and the
     provinces that DO have business were squeezed into the top of the scale. */
  const values = scope
    .map(readMetric)
    .filter((v): v is number => v !== null && v !== 0);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;

  /* Nothing HAPPENED in this window - not "nothing loaded". Judged on the four
     stages the ribbon draws, because those are what the period actually
     filters; 客户 is deliberately not among them, since accounts carry no date
     and are never filtered. */
  const empty =
    total.leads === 0 && total.pipelineValue === 0 &&
    total.contractValue === 0 && total.collected === 0;

  const shadeOf = (p: ProvinceRollup): string => {
    const v = readMetric(p);
    /* NOTHING IS ITS OWN COLOUR, not the bottom of the ramp. A province with no
       contracts at all was drawn in the ramp's darkest blue, which says "least
       of the ones that have some" - a different and much weaker claim than
       "none". Grey says 未覆盖 and cannot be misread as a small amount.
       Null and zero take the same colour deliberately: the map is asked "how
       much is here", and "nothing has been recorded" and "nothing happened"
       are the same answer to that question. */
    if (v === null || v === 0) return "var(--screen-blank)";
    const t = hi === lo ? 0.6 : (v - lo) / (hi - lo);
    return `var(--screen-l${Math.min(5, Math.max(0, Math.round(t * 5)))})`;
  };

  /* A cell is a value and an optional unit, kept apart so the unit can be set
     smaller - the design's <small> inside .v. */
  const pctCell = (v: number | null) =>
    v === null
      ? { v: SCREEN_TEXT.noReading }
      : { v: (v * 100).toFixed(1), unit: "%" };
  const moneyCell = (v: number) => {
    const m = cash(v);
    return { v: m.n, unit: m.u };
  };
  const pct = (v: number | null) =>
    v === null ? SCREEN_TEXT.noReading : `${(v * 100).toFixed(1)}%`;

  /* Positioned against the MAP's box, which is the element the panel is
     absolutely positioned inside.
     PREFER, THEN CLAMP - and the clamp is the part that matters. Opening away
     from the cursor near an edge is not enough on its own, because the pointer
     is not always inside the box: a province's own shape can extend past the
     frame (海南 sits nearly 100px below it), so the cursor can be outside the
     container the panel lives in and "flip" then pushes it further out. The
     preference decides which side of the cursor it opens on; the clamp
     guarantees it is on the map whatever the preference produced.

     The size is MEASURED rather than assumed. A proportion of the frame - "the
     bottom 30%" - happens to work at 1080 tall and fails on a short window,
     where 30% of the map is less than the panel itself; that is the same class
     of bug as the hard-coded 228 it replaced. */
  const moveTip = (e: React.PointerEvent, p: ProvinceRollup) => {
    const box = mapRef.current?.getBoundingClientRect();
    if (!box) return;
    const { w, h } = tipSize.current;
    const cx = e.clientX - box.left;
    const cy = e.clientY - box.top;

    const fit = (near: number, far: number, size: number, limit: number) => {
      const chosen = near + size <= limit ? near : far;
      return Math.max(0, Math.min(chosen, limit - size));
    };

    setTip({
      p,
      x: fit(cx + 16, cx - 16 - w, w, box.width),
      y: fit(cy + 14, cy - 14 - h, h, box.height),
    });
  };

  const fmtMetric = (v: number | null): string => {
    if (v === null) return SCREEN_TEXT.noReading;
    if (metric === "healthRate") return `${(v * 100).toFixed(1)}%`;
    const m = cash(v);
    return m.n + m.u;
  };

  function stepOut() {
    if (level === "province") { setLevel("region"); setProvince(null); }
    else if (level === "region") { setLevel("nation"); setRegion(null); }
  }

  const frame = useMemo(() => frameFor(level, scope), [level, scope]);

  const METRICS: readonly { id: Metric; label: string; rate?: boolean }[] = [
    { id: "contractValue", label: SCREEN_TEXT.metricContract },
    { id: "pipelineValue", label: SCREEN_TEXT.metricPipeline },
    { id: "inDelivery", label: SCREEN_TEXT.metricInDelivery },
    { id: "healthRate", label: SCREEN_TEXT.metricHealth, rate: true },
  ];


  return (
    <div className={`screen${titleFolded ? " folded" : ""}`}>
      <ScreenHex />

      {/* 统计周期条 - it lives OUTSIDE the title bar so it survives the fold.
          Folded, it rides up to the top edge and stays usable there.

          TWO CONTROLS, NOT ONE. It was a single button that both showed the
          date and folded the title, which meant the only way to read the date
          was to hover a control that does something else. They are now
          separate: a fold handle, then the period. The handle is deliberately
          the wider of the two - it is hit far more often than it is read, and
          a caret alone is a small target on a screen people drive standing up.
          Its chevron points where the title is ABOUT to go, not where it is. */}
      <div className="periodbar">
        <button
          type="button"
          className="fold"
          aria-label={titleFolded ? SCREEN_TEXT.unfoldTitle : SCREEN_TEXT.foldTitle}
          aria-expanded={!titleFolded}
          onClick={() => setTitleFolded((v) => !v)}
        >
          {/* A CIRCLED CARET (owner). The bare chevron read as punctuation
              rather than as something to press; the ring gives it an edge and
              makes the target legible at the distance this screen is read
              from. The caret still points where the title is about to go. */}
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.1" opacity=".55" />
            <path d="M5.4 6.9 L8 9.5 L10.6 6.9" stroke="currentColor" strokeWidth="1.3"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span className="period" ref={periodRef}>
          <button
            type="button"
            className="period-btn"
            aria-expanded={periodOpen}
            aria-haspopup="menu"
            onClick={() => setPeriodOpen((v) => !v)}
          >
            {period.label}
            <svg viewBox="0 0 8 8" fill="none" aria-hidden>
              <path d="M1.5 2.5 L4 5.5 L6.5 2.5" stroke="currentColor" strokeWidth="1.3"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {periodOpen ? (
            <span className="period-pop" role="menu">
              {periods.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="menuitem"
                  className={p.key === periodKey ? "on" : ""}
                  onClick={() => { setPeriodKey(p.key); setPeriodOpen(false); }}
                >
                  {p.label}
                </button>
              ))}
            </span>
          ) : null}
        </span>
      </div>

      <header className={`titlebar${titleFolded ? " folded" : ""}`}>
        <div className="chips">
          <Link className="home" href="/" aria-label={SCREEN_TEXT.home}>
            <svg viewBox="0 0 13 13" fill="none" aria-hidden>
              <path d="M7.5 1.5 L3 6.5 L7.5 11.5" stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {SCREEN_TEXT.home}
          </Link>
          <div className="chip">
            <div className="k">{SCREEN_TEXT.provinceCount}</div>
            <div className="v">{scope.filter((p) => p.accounts > 0).length}</div>
          </div>
          <div className="chip">
            <div className="k">{SCREEN_TEXT.openDeals}</div>
            <div className="v">{num(total.openDeals)}</div>
          </div>
        </div>

        <div className="title">
          {/* 跟随选择变化 - the scope, a centre dot, then what this is. It read
              a fixed 全国销售态势屏 at every level, so drilling into 广东 left
              the largest words on the screen describing the country. */}
          <h1>{scopeName}<span className="dot">·</span>{SCREEN_TEXT.title}</h1>
          <p>{SCREEN_TEXT.subtitle}</p>
        </div>

        <div className="ident">
          {rollup.unplacedAccounts > 0 ? (
            // SAID OUT LOUD. These accounts are in the national total and on no
            // province, so without this line the map and the header disagree
            // and nothing explains why.
            <span className="screen-note">
              {SCREEN_TEXT.unplacedNote(rollup.unplacedAccounts)}
            </span>
          ) : null}
          {/* The design puts a named person here with an avatar, a name and a
              role. Two of the three are real: the avatar takes the sub's own
              initials and the second line is the sub itself, monospaced. The
              NAME line is the workspace, not an invented person - AuthUser
              carries no display name, and dressing an id up as somebody called
              张明 is the defect the account page already fixed once. */}
          <ScreenTools />

          <div className="user">
            <div className="av" aria-hidden>{initialsOf(viewerSub)}</div>
            <div>
              <div className="nm">{SCREEN_TEXT.viewerRole}</div>
              <div className="rl" title={viewerSub}>{viewerSub}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="screen-deck">
        <aside className={`rail rail-left${railsFolded ? " folded" : ""}`}>
          <div className="rail__body">
            <Mod step="01" title={SCREEN_TEXT.panelLeads} href={enter.leads} enterLabel={SCREEN_TEXT.enter}>
              <Cells>
                <Cell k={SCREEN_TEXT.cellLeadsNew} v={num(total.leadsNew)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellLeadsUnclaimed} v={num(total.leadsUnclaimed)} tone="amber" />
                <Cell k={SCREEN_TEXT.cellLeadConversion} {...pctCell(total.leadConversion)} />
              </Cells>
              <Bars
                id="leadChart"
                series={total.leadSeries}
                colour="var(--screen-accent)"
                label={SCREEN_TEXT.chartLeads}
                fmt={num}
              />
            </Mod>

            <Mod step="02" title={SCREEN_TEXT.panelPipeline} href={enter.pipeline} enterLabel={SCREEN_TEXT.enter}>
              <Cells>
                <Cell k={SCREEN_TEXT.cellPipelineValue} {...moneyCell(total.pipelineValue)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellOpenDeals} v={num(total.openDeals)} />
                <Cell k={SCREEN_TEXT.cellWeighted} {...moneyCell(total.weighted)} />
              </Cells>
              <StageChart
                mix={total.stageMix}
                labels={SCREEN_TEXT.stageLabels}
                fmt={{ num, money: (v) => cash(v).n + cash(v).u }}
              />
            </Mod>

            <Mod step="03" title={SCREEN_TEXT.panelContract} href={enter.contract} enterLabel={SCREEN_TEXT.enter}>
              <Cells>
                <Cell k={SCREEN_TEXT.cellContractValue} {...moneyCell(total.contractValue)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellWonDeals} v={num(total.wonDeals)} />
                <Cell k={SCREEN_TEXT.cellWinRate} {...pctCell(total.winRate)} />
              </Cells>
              {/* THE NUMBER ONLY, no unit. Twelve labels each carrying 万元
                  ran the strip out of room and the figures collided; the unit
                  is already on the 合同额 cell directly above, which is what a
                  reader checks it against. */}
              <Bars
                id="signChart"
                series={total.signSeries}
                colour="var(--screen-accent-hi)"
                label={SCREEN_TEXT.chartSign}
                fmt={(v) => cash(v).n}
              />
            </Mod>
          </div>
        </aside>

        <section className="screen-arena">
          <div className="screen-bar">
            <nav className="screen-crumb">
              {level === "nation" ? (
                <span className="cur">{SCREEN_TEXT.nation}</span>
              ) : (
                <button type="button" onClick={() => { setLevel("nation"); setRegion(null); setProvince(null); }}>
                  {SCREEN_TEXT.nation}
                </button>
              )}
              <span className="sep">▸</span>
              <span className="screen-menu" ref={menuRef}>
                <button
                  type="button"
                  className={region ? "chosen" : "placeholder"}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  {divisionName(region) ?? SCREEN_TEXT.regionDefault} ▾
                </button>
                {menuOpen ? (
                  <span className="screen-pop" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setLevel("nation"); setRegion(null); setProvince(null); setMenuOpen(false); }}>
                      {SCREEN_TEXT.regionDefault}
                    </button>
                    {/* THE WORKSPACE'S OWN DIVISIONS, in its own order. Nothing
                        here knows there are five of them or what they are
                        called - a tenant that renames 东部 or moves a province
                        gets a menu, a map and a breadcrumb that all agree,
                        without a deploy. */}
                    {divisions.map((d) => (
                      <button
                        key={d.code}
                        type="button"
                        role="menuitem"
                        className={d.code === region ? "on" : ""}
                        onClick={() => { setLevel("region"); setRegion(d.code); setProvince(null); setMenuOpen(false); }}
                      >
                        {d.name}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
              {level === "province" && province ? (
                <>
                  <span className="sep">▸</span>
                  {/* THE SHORT NAME, the same one the map labels it with and
                      the same one the title carries. 广东省 in the breadcrumb
                      beside 广东 on the map reads as two different places. */}
                  <span className="cur">{shortProvince(province)}</span>
                </>
              ) : null}
            </nav>

            <div className="screen-picks">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`screen-pick${m.rate ? " rate" : ""}${m.id === metric ? " on" : ""}`}
                  onClick={() => setMetric(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="screen-map"
            ref={mapRef}
            onContextMenu={(e) => { e.preventDefault(); stepOut(); }}
          >
            <svg
              viewBox={`${frame[0]} ${frame[1]} ${frame[2]} ${frame[3]}`}
              preserveAspectRatio="xMidYMid meet"
              aria-label={SCREEN_TEXT.title}
            >
              {/* Bare canvas is the step-out gesture. Sized to the frame, not to
                  a huge rectangle: an oversized one escapes this svg's box and
                  swallows pointer events across the whole screen. */}
              <rect
                x={frame[0]} y={frame[1]} width={frame[2]} height={frame[3]}
                fill="transparent" onClick={stepOut}
              />
              {rollup.provinces.map((p) => {
                const shape = CHINA.provinces[p.province];
                if (!shape || !inScope.has(p.province)) return null;
                return (
                  <path
                    key={p.province}
                    d={shape.d}
                    className={`screen-prov${province === p.province ? " sel" : ""}`}
                    style={{ fill: shadeOf(p) }}
                    onClick={() => {
                      setLevel("province");
                      setProvince(p.province);
                      // The workspace's division for it, so stepping out of a
                      // province lands in the 大区 that workspace puts it in.
                      setRegion(p.division || null);
                    }}
                    onPointerMove={(e) => moveTip(e, p)}
                    onPointerLeave={() => setTip(null)}
                  />
                );
              })}
              {/* 南海诸岛 in the corner, the conventional treatment and a
                  geometric necessity: the nine-dash line reaches about 4N, so
                  drawing it inline would squash the country into the top half
                  of its own frame. Shown only at national scope - at region
                  zoom it is neither in view nor relevant. */}
              {level === "nation" ? (
                <g
                  className="screen-sea"
                  transform={`translate(${
                    frame[0] + frame[2] - CHINA.seaViewBox[2] * ((frame[3] * 0.2) / CHINA.seaViewBox[3]) - frame[2] * 0.015
                  },${
                    frame[1] + frame[3] - CHINA.seaViewBox[3] * ((frame[3] * 0.2) / CHINA.seaViewBox[3]) - frame[3] * 0.02
                  }) scale(${(frame[3] * 0.2) / CHINA.seaViewBox[3]})`}
                  pointerEvents="none"
                >
                  <rect
                    x={CHINA.seaViewBox[0]} y={CHINA.seaViewBox[1]}
                    width={CHINA.seaViewBox[2]} height={CHINA.seaViewBox[3]}
                  />
                  <path d={CHINA.sea} />
                </g>
              ) : null}

              {scope.length <= 12
                ? scope.map((p) => {
                    const shape = CHINA.provinces[p.province];
                    if (!shape) return null;
                    const k = frame[2] / 1100;
                    return (
                      <g key={`l-${p.province}`} pointerEvents="none">
                        <text className="screen-plabel" x={shape.cx} y={shape.cy}
                              textAnchor="middle" fontSize={14 * k} strokeWidth={3 * k}>
                          {shortProvince(p.province)}
                        </text>
                        <text className="screen-pval" x={shape.cx} y={shape.cy + 17 * k}
                              textAnchor="middle" fontSize={15 * k} strokeWidth={3 * k}>
                          {fmtMetric(readMetric(p))}
                        </text>
                      </g>
                    );
                  })
                : null}
            </svg>

            {level !== "nation" ? (
              <button type="button" className="screen-back" onClick={stepOut}>
                ↩ {SCREEN_TEXT.back}
              </button>
            ) : null}

            {/* GREY IS ON THE KEY, off to the side and separated by a gap.
                It is not the ramp's first step - it is the other answer - and
                a reader who sees a grey province needs somewhere to look it
                up. Without this the legend implied the ramp covered
                everything on the map. */}
            <div className="screen-scale">
              <i className="none" style={{ background: "var(--screen-blank)" }} />
              <span className="none-label">{SCREEN_TEXT.uncovered}</span>
              <span>{fmtMetric(values.length ? lo : null)}</span>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <i key={i} style={{ background: `var(--screen-l${i})` }} />
              ))}
              <span>{fmtMetric(values.length ? hi : null)}</span>
            </div>

            {/* A PERIOD WITH NOTHING IN IT SAYS SO. Otherwise it is a wall of
                zeros over 34 grey provinces, which is indistinguishable from a
                screen that has failed to load - and the reader's next move is
                to report a bug rather than to pick another period. */}
            {empty ? (
              <p className="screen-empty">{SCREEN_TEXT.emptyPeriod(period.label)}</p>
            ) : null}

            {tip ? (
              <div
                ref={tipRef}
                className="tip"
                style={{ left: tip.x, top: tip.y }}
                role="status"
              >
                <div className="t">{tip.p.province}</div>
                <div className="r">
                  <span>{SCREEN_TEXT.cellPipelineValue}</span>
                  <b>{cash(tip.p.pipelineValue).n}{cash(tip.p.pipelineValue).u}</b>
                </div>
                <div className="r">
                  <span>{SCREEN_TEXT.cellContractValue}</span>
                  <b>{cash(tip.p.contractValue).n}{cash(tip.p.contractValue).u}</b>
                </div>
                <div className="r">
                  <span>{SCREEN_TEXT.cellCollected}</span>
                  <b>{cash(tip.p.collected).n}{cash(tip.p.collected).u}</b>
                </div>
                <div className="r">
                  <span>{SCREEN_TEXT.cellOverdue}</span>
                  <b>{cash(tip.p.overdue).n}{cash(tip.p.overdue).u}</b>
                </div>
                <div className="r">
                  <span>{SCREEN_TEXT.metricHealth}</span>
                  <b>{pct(tip.p.healthRate)}</b>
                </div>
              </div>
            ) : null}

            {/* Pinned to the map's own edges, as the design places them. */}
            <FoldArc
              side="left"
              folded={railsFolded}
              lit={arcLit}
              onHover={setArcLit}
              onToggle={() => setRailsFolded((v) => !v)}
              label={railsFolded ? SCREEN_TEXT.unfoldRails : SCREEN_TEXT.foldRails}
            />
            <FoldArc
              side="right"
              folded={railsFolded}
              lit={arcLit}
              onHover={setArcLit}
              onToggle={() => setRailsFolded((v) => !v)}
              label={railsFolded ? SCREEN_TEXT.unfoldRails : SCREEN_TEXT.foldRails}
            />
          </div>

          {/* 漏斗带 - the four stages with the conversion between each.
              THE ARROWS ARE THE POINT, and they were missing: without them
              this is four unrelated totals sitting in a row, and nothing says
              that each one is what survived from the one on its left. The rate
              on each connector is that survival, stated.

              线索 -> 商机 -> 合同 -> 回款, which is a genuine chain: every
              figure is derived from the rows behind the previous one, so the
              row reconciles by construction. 在交付 is deliberately NOT here -
              it is a SUBSET of 合同 rather than the next link, and putting it
              in the chain produced an arrow reading 130%. */}
          <div className="screen-ribbon">
            <div className="node">
              <div className="k">{SCREEN_TEXT.funnelLeads}</div>
              <div className="v">{num(total.leads)}<small>{SCREEN_TEXT.leadsUnit}</small></div>
            </div>

            <Conv rate={ratio(total.openDeals, total.leads)} />

            <div className="node">
              <div className="k">{SCREEN_TEXT.funnelPipeline}</div>
              <div className="v">{cash(total.pipelineValue).n}<small>{cash(total.pipelineValue).u}</small></div>
            </div>

            <Conv rate={ratio(total.contractValue, total.pipelineValue)} />

            <div className="node win">
              <div className="k">{SCREEN_TEXT.funnelContract}</div>
              <div className="v">{cash(total.contractValue).n}<small>{cash(total.contractValue).u}</small></div>
            </div>

            <Conv rate={ratio(total.collected, total.contractValue)} />

            <div className="node cash">
              <div className="k">{SCREEN_TEXT.funnelCollected}</div>
              <div className="v">{cash(total.collected).n}<small>{cash(total.collected).u}</small></div>
            </div>
          </div>
        </section>


        <aside className={`rail rail-right${railsFolded ? " folded" : ""}`}>
          <div className="rail__body">
            {/* 主数字是采纳率, 副数字是它的分子分母. The rate never appears
                without the volume it was computed from - a high rate over three
                proposals is not a result.

                ORDER MATTERS ACROSS THE SEAM (owner, 2026-09-07). This panel
                used to END on a row of numbers while 交付履约 BEGINS with one,
                so the two collided into a single dense band at the boundary. The
                three figures now sit together at the top and the panel closes on
                the chart, which gives the next panel's numbers a quiet edge. */}
            <Mod step="AI" title={SCREEN_TEXT.panelCopilot} right href={enter.copilot} enterLabel={SCREEN_TEXT.enter}>
              <div className="hero">
                <div className="hero-v">
                  {total.adoption === null ? SCREEN_TEXT.noReading : (total.adoption * 100).toFixed(1)}
                  {total.adoption === null ? null : <small>%</small>}
                </div>
                <div className="hero-s">
                  <div className="hero-k">{SCREEN_TEXT.cellAdoption}</div>
                  <div className="hero-r">
                    <b>{num(total.accepted30)}</b> / <span>{num(total.proposals30)}</span>
                    {" "}{SCREEN_TEXT.adoptionSuffix}
                  </div>
                </div>
              </div>
              <div className="duo">
                <div>
                  <div className="k">{SCREEN_TEXT.cellInfluenced}</div>
                  <div className="v hi">
                    <span>{cash(total.influenced).n}<small>{cash(total.influenced).u}</small></span>
                    <span className="qual">{SCREEN_TEXT.qualExpected}</span>
                  </div>
                </div>
                <div>
                  <div className="k">{SCREEN_TEXT.cellPending}</div>
                  <div className="v amber">
                    <span>{num(total.pending)}</span>
                    <span className="plus">+{num(total.pendingLate)}</span>
                    <span className="qual">{SCREEN_TEXT.qualLate}</span>
                  </div>
                </div>
              </div>
              <AdoptionTrend series={total.adoptionSeries} label={SCREEN_TEXT.chartAdoption} />
            </Mod>

            <Mod step="04" title={SCREEN_TEXT.panelDelivery} right href={enter.delivery} enterLabel={SCREEN_TEXT.enter}>
              <Cells>
                <Cell k={SCREEN_TEXT.cellInDelivery} {...moneyCell(total.inDelivery)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellProjectsLive} v={num(total.projectsLive)} />
                <Cell k={SCREEN_TEXT.cellOnTime} {...pctCell(total.onTime)} tone="hi" />
              </Cells>
              <HealthDonut
                mix={total.healthMix}
                labels={SCREEN_TEXT.healthLabels}
                centreLabel={SCREEN_TEXT.healthCentre}
              />
            </Mod>

            <Mod step="05" title={SCREEN_TEXT.panelCollection} right href={enter.collection} enterLabel={SCREEN_TEXT.enter}>
              <Cells>
                <Cell k={SCREEN_TEXT.cellCollected} {...moneyCell(total.collected)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellReceivable} {...moneyCell(total.receivable)} />
                <Cell k={SCREEN_TEXT.cellOverdue} {...moneyCell(total.overdue)} tone="red" />
              </Cells>
              <CashChart
                collected={total.collected}
                receivable={total.receivable}
                overdue={total.overdue}
                series={total.cashSeries}
                labelCollected={SCREEN_TEXT.cashCollected}
                labelOverdue={SCREEN_TEXT.cashOverdue}
                label={SCREEN_TEXT.chartCash}
              />
            </Mod>
          </div>
        </aside>
      </div>
    </div>
  );
}
