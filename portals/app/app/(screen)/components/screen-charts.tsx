"use client";

import { useRef, useState } from "react";
import { STAGE_KEYS, HEALTH_KEYS } from "../lib/rollup";

/* 态势屏的六个图 - the design's charts, drawn from the product's own data.
 *
 * GEOMETRY IS THE DESIGN'S, NUMBERS ARE OURS. Every viewBox, bar width, axis
 * position and label below is the one the approved mock draws; what changed is
 * where the series comes from. The mock filled them with seeded noise because
 * it had no database behind it, and noise on a wall display is worse than an
 * empty panel: it is a reading nobody can act on and nobody can tell is fake.
 *
 * COLOURS ARE DS TOKENS, via the stylesheet's own variables. The DS has no cyan
 * family, so the mock's cyan is sky - its nearest neighbour - which is the one
 * documented substitution on this screen (TD-025).
 */

const CYAN = "var(--screen-accent)";
const CYAN_B = "var(--screen-accent-hi)";
const AMBER = "var(--screen-warn)";
const RED = "var(--screen-danger)";

export interface Fmt {
  /** A count, grouped. */
  num: (v: number) => string;
  /** Money, scaled and carrying its own unit. */
  money: (v: number) => string;
}

/**
 * The 12-period bar strip, used by 线索供给 and 签约合同.
 *
 * EVERY BAR CARRIES ITS NUMBER, tiny until you go near it (owner, 2026-09-07).
 * A 12-bar strip has no room for twelve legible figures but plenty of room for
 * twelve faint ones, so the value sits at 7px and grows to 12px with full
 * contrast when the pointer enters that bar's own column. The hit area is a
 * transparent rect spanning the FULL height, not the bar: a short bar is a few
 * pixels tall and would be a target nobody can hit.
 */
export function Bars(
  { id, series, colour, label, fmt }:
  { id: string; series: readonly number[]; colour: string; label: string; fmt: (v: number) => string },
) {
  const W = 328, H = 112, n = series.length, bw = W / n;
  const max = Math.max(...series) || 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ flex: 1, minHeight: 0 }} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`g_${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CYAN_B} />
          <stop offset=".38" stopColor={colour} />
          <stop offset="1" stopColor={colour} stopOpacity=".52" />
        </linearGradient>
      </defs>
      {series.map((v, i) => {
        const h = (v / max) * (H - 34), x = i * bw + 3, w = bw - 6;
        return (
          <g className="barcol" key={i}>
            <rect x={x} y={H - 22 - h} width={w} height={h} fill={`url(#g_${id})`} />
            <rect x={x} y={H - 22 - h} width={w} height={1.5} fill={CYAN_B} opacity=".9" />
            <text className="barval" x={x + w / 2} y={H - 27 - h} textAnchor="middle">{fmt(v)}</text>
            <rect className="barhit" x={i * bw} y={0} width={bw} height={H - 22} fill="transparent" />
          </g>
        );
      })}
      <line x1="0" y1={H - 22} x2={W} y2={H - 22} className="axis" />
      <text className="slab" x="0" y={H - 5}>{label}</text>
    </svg>
  );
}

/**
 * 商机储备's stage bars.
 *
 * The four run across the ramp's LIT half only (l5..l3) with a horizontal
 * fade, so they stay distinguishable without any of them going dim - 决策签批,
 * the stage nearest the money, must not read as the faintest bar on the panel.
 */
export function StageChart(
  { mix, labels, fmt }:
  { mix: readonly number[]; labels: readonly string[]; fmt: Fmt },
) {
  const W = 328, x0 = 62, barW = W - x0 - 74;
  const total = mix.reduce((a, b) => a + b, 0) || 1;
  const lit = ["var(--screen-l5)", "var(--screen-l5)", "var(--screen-l4)", "var(--screen-l3)"];
  return (
    <svg viewBox={`0 0 ${W} 112`} style={{ flex: 1, minHeight: 0 }} role="img">
      <defs>
        {lit.map((c, i) => (
          <linearGradient id={`sg${i}`} key={i} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={c} />
            <stop offset="1" stopColor={c} stopOpacity=".55" />
          </linearGradient>
        ))}
      </defs>
      {STAGE_KEYS.map((_, i) => {
        const v = (mix[i] ?? 0) / total, y = 2 + i * 26;
        return (
          /* THE SAME HOVER AS THE BAR STRIPS. This panel had none at all - it
             is the one chart in the left rail that is not `Bars`, so it was
             silently left out of a behaviour the other two have. The hit area
             spans the whole row, not the drawn bar: a stage with almost
             nothing in it draws three pixels and would be untargetable. */
          <g className="stagerow" key={i}>
            <text className="slab" x="0" y={y + 13}>{labels[i]}</text>
            <rect x={x0} y={y + 2} width={barW} height="14" className="trough" />
            <rect x={x0} y={y + 2} width={Math.max(3, v * barW)} height="14" fill={`url(#sg${i})`} />
            <text className="val stageval" x={W} y={y + 13} textAnchor="end">
              {fmt.money(mix[i] ?? 0)}
            </text>
            <rect className="barhit" x="0" y={y} width={W} height="22" fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 智能副驾's 30-day 采纳率 band.
 *
 * A sparkline says "up or down"; a band with a scale says how far - and 采纳率
 * is read against a target, not against its own last value. A day on which the
 * copilot proposed nothing has no rate, so the line CARRIES FORWARD the last
 * reading rather than dropping to zero: a quiet day is not a day the humans
 * rejected everything.
 */
export function AdoptionTrend(
  { series, label }:
  { series: readonly { acc: number; prop: number }[]; label: string },
) {
  const W = 328, H = 140, N = series.length;
  const xs = (i: number) => i * (W / (N - 1));
  const ys = (v: number) => H - 16 - v * (H - 26);

  /* A day on which the copilot proposed nothing has no rate, so the line
     CARRIES FORWARD the last reading rather than dropping to zero: a quiet day
     is not a day on which the humans rejected everything. `real` remembers
     which days were actually measured, so the readout can say so. */
  let carried = 0;
  const pts: number[] = [];
  const real: boolean[] = [];
  for (const d of series) {
    if (d.prop > 0) carried = d.acc / d.prop;
    pts.push(carried);
    real.push(d.prop > 0);
  }
  const d = pts.map((v, i) => `${i ? "L" : "M"}${xs(i)} ${ys(v)}`).join(" ");

  const [at, setAt] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  /* The pointer arrives in SCREEN pixels and the chart is drawn in viewBox
     units; the two are only the same when the rail happens to be its design
     width. Scaling by the rendered rect keeps the readout under the cursor at
     any size, which a raw offsetX does not. */
  const track = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round((x / W) * (N - 1));
    setAt(Math.max(0, Math.min(N - 1, i)));
  };

  const v = at === null ? null : pts[at]!;
  // Keep the readout inside the chart when the cursor is near the right edge.
  const flip = at !== null && xs(at) > W - 64;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ marginTop: "auto" }}
      role="img"
      aria-label={label}
      onPointerMove={track}
      onPointerLeave={() => setAt(null)}
    >
      <defs>
        <linearGradient id="agg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CYAN} stopOpacity=".4" />
          <stop offset="1" stopColor={CYAN} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${xs(N - 1)} ${H - 14} L0 ${H - 14} Z`} fill="url(#agg)" />
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <g key={g}>
          <line x1="0" y1={ys(g)} x2={W} y2={ys(g)} className="gridline" />
          <text className="tick" x={W} y={ys(g) - 3} textAnchor="end">{Math.round(g * 100)}%</text>
        </g>
      ))}
      <path d={d} fill="none" stroke={CYAN} strokeWidth="1.8" />
      <circle cx={xs(N - 1)} cy={ys(pts[N - 1] ?? 0)} r="3.4" fill={CYAN_B} />

      {at !== null && v !== null ? (
        <g className="crosshair">
          <line x1={xs(at)} y1="0" x2={xs(at)} y2={H - 14} className="crossline" />
          <circle cx={xs(at)} cy={ys(v)} r="3.6" fill={CYAN_B} />
          <text
            className="crossval"
            x={flip ? xs(at) - 7 : xs(at) + 7}
            y={Math.max(11, ys(v) - 8)}
            textAnchor={flip ? "end" : "start"}
          >
            {`${(v * 100).toFixed(1)}%`}
          </text>
        </g>
      ) : null}

      <line x1="0" y1={H - 14} x2={W} y2={H - 14} className="axis" />
      <text className="slab" x="0" y={H}>{label}</text>
      {/* Drawn last and over everything, so the pointer is never stolen by a
          gridline or the filled area beneath it. */}
      <rect x="0" y="0" width={W} height={H - 14} fill="transparent" />
    </svg>
  );
}

/**
 * 交付履约's health donut.
 *
 * 健康 takes the same bright tint every LEAD number on this screen uses, so
 * the one reading the map is coloured by is not the dimmest of the three.
 */
export function HealthDonut(
  { mix, labels, centreLabel }:
  { mix: readonly number[]; labels: readonly string[]; centreLabel: string },
) {
  const cx = 58, cy = 58, r = 47, th = 11;
  const cols = [CYAN_B, AMBER, RED];
  const total = mix.reduce((a, b) => a + b, 0);
  const pcts = HEALTH_KEYS.map((_, i) => (total === 0 ? 0 : (mix[i] ?? 0) / total));

  /* ONE HOVER, TWO PLACES. The arc and its line in the key are the same
     reading, so pointing at either lights both - hovering an arc and watching
     an unrelated-looking row change is what tells a reader they belong
     together. Held in state rather than done in CSS because the two elements
     are in different subtrees and no selector joins them. */
  const [at, setAt] = useState<number | null>(null);

  let a0 = -Math.PI / 2;
  const arcs = pcts.map((v, i) => {
    if (v <= 0) return null;
    const on = at === i;
    const common = {
      fill: cols[i],
      className: `band${on ? " on" : ""}`,
      onPointerEnter: () => setAt(i),
      onPointerLeave: () => setAt(null),
    };
    // A single band covering everything cannot be drawn as an arc - its start
    // and end coincide - so it is a plain ring.
    if (v >= 0.999) {
      return (
        <circle key={i} cx={cx} cy={cy} r={r - th / 2} fill="none"
                stroke={cols[i]} strokeWidth={th}
                className={`band${on ? " on" : ""}`}
                onPointerEnter={() => setAt(i)} onPointerLeave={() => setAt(null)} />
      );
    }
    const a1 = a0 + v * Math.PI * 2 - 0.05;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    /* ROUNDED, and not for tidiness. Node and the browser's V8 disagree on the
       last bits of cos/sin, so the server and client rendered path strings that
       differed in the 15th decimal - a real hydration mismatch React refuses to
       patch up. Three decimals is far below a pixel at 108px wide and makes the
       two agree exactly. */
    const r3 = (n: number) => n.toFixed(3);
    const P = (a: number, rr: number) => `${r3(cx + Math.cos(a) * rr)} ${r3(cy + Math.sin(a) * rr)}`;
    const d =
      `M${P(a0, r)} A${r} ${r} 0 ${big} 1 ${P(a1, r)}` +
      `L${P(a1, r - th)} A${r - th} ${r - th} 0 ${big} 0 ${P(a0, r - th)} Z`;
    a0 = a1 + 0.05;
    return <path key={i} d={d} {...common} />;
  });

  // The centre shows whatever is being pointed at, and 健康 when nothing is.
  const shown = at === null ? 0 : at;

  return (
    <div className="screen-health">
      <svg viewBox="0 0 116 116" style={{ width: 108, flex: "none" }} role="img">
        {arcs}
        <text x={cx} y={cy + 2} textAnchor="middle" className="val donutval"
              fontSize="23" fill={cols[shown]}>
          {total === 0 ? "-" : `${Math.round(pcts[shown]! * 100)}%`}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" className="tick">
          {at === null ? centreLabel : labels[at]}
        </text>
      </svg>
      <div className="legend">
        {labels.map((k, i) => (
          <div
            key={k}
            className={at === i ? "on" : ""}
            onPointerEnter={() => setAt(i)}
            onPointerLeave={() => setAt(null)}
          >
            <i style={{ background: cols[i] }} />
            {k}
            <b style={{ color: cols[i] }}>
              {total === 0 ? "-" : `${(pcts[i]! * 100).toFixed(1)}%`}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 回款兑现's split bar over the 7-period collection rate.
 *
 * The line takes the same readout the copilot's trend has: a dashed vertical
 * reference following the pointer with that period's rate beside it. Seven
 * points across 328px are twenty pixels apart, which is close enough that
 * reading one off the axis is guesswork without it.
 */
export function CashChart(
  { collected, receivable, overdue, series, labelCollected, labelOverdue, label }:
  {
    collected: number; receivable: number; overdue: number;
    series: readonly { got: number; due: number }[];
    labelCollected: (p: string) => string;
    labelOverdue: (p: string) => string;
    label: string;
  },
) {
  const W = 328, H = 112;
  const total = collected + receivable || 1;
  const y0 = 48, y1 = 94, N = series.length;
  const xs = (i: number) => i * ((W - 4) / (N - 1));
  const ys = (v: number) => y1 - (v / 100) * (y1 - y0);

  /* A period in which nothing fell due has no rate; the line carries the last
     reading across rather than plunging to zero on a quiet fortnight. `real`
     remembers which ones were measured, so the readout can say so. */
  let carried = 0;
  const pts: number[] = [];
  const real: boolean[] = [];
  for (const d of series) {
    if (d.due > 0) carried = Math.max(0, Math.min(100, (d.got / d.due) * 100));
    pts.push(carried);
    real.push(d.due > 0);
  }

  const [at, setAt] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Screen pixels to viewBox units, so the readout stays under the cursor at
  // any rail width - a raw offsetX only agrees when the two happen to match.
  const track = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round((x / (W - 4)) * (N - 1));
    setAt(Math.max(0, Math.min(N - 1, i)));
  };

  const v = at === null ? null : pts[at]!;
  const flip = at !== null && xs(at) > W - 58;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ flex: 1, minHeight: 0 }}
      role="img"
      aria-label={label}
      onPointerMove={track}
      onPointerLeave={() => setAt(null)}
    >
      <rect x="0" y="4" width={W} height="18" className="trough" />
      <rect x="0" y="4" width={(W * collected) / total} height="18" fill={CYAN} />
      <rect x={(W * collected) / total} y="4"
            width={(W * Math.max(0, receivable - overdue)) / total} height="18"
            fill={AMBER} opacity=".72" />
      <rect x={(W * (collected + receivable - overdue)) / total} y="4"
            width={(W * overdue) / total} height="18" fill={RED} />
      <text className="tick" x="0" y="37">
        {labelCollected(`${((collected / total) * 100).toFixed(1)}%`)}
      </text>
      <text className="tick" x={W} y="37" textAnchor="end">
        {labelOverdue(`${((overdue / total) * 100).toFixed(1)}%`)}
      </text>

      <path d={pts.map((p, i) => `${i ? "L" : "M"}${xs(i)} ${ys(p)}`).join(" ")}
            fill="none" stroke={CYAN} strokeWidth="2" />
      {pts.map((p, i) => (
        <circle key={i} cx={xs(i)} cy={ys(p)} r="2.6"
                fill="var(--screen-ground)" stroke={CYAN} strokeWidth="1.5" />
      ))}

      {at !== null && v !== null ? (
        <g className="crosshair">
          <line x1={xs(at)} y1={y0 - 8} x2={xs(at)} y2={y1} className="crossline" />
          <circle cx={xs(at)} cy={ys(v)} r="3.4" fill={CYAN_B} />
          <text
            className="crossval"
            x={flip ? xs(at) - 6 : xs(at) + 6}
            y={Math.max(y0 - 2, ys(v) - 7)}
            textAnchor={flip ? "end" : "start"}
          >
            {real[at] ? `${v.toFixed(1)}%` : "-"}
          </text>
        </g>
      ) : null}

      <line x1="0" y1={y1} x2={W} y2={y1} className="axis" />
      <text className="slab" x="0" y="109">{label}</text>
      {/* Over the line, so a data point never steals the pointer. */}
      <rect x="0" y={y0 - 8} width={W} height={y1 - y0 + 8} fill="transparent" />
    </svg>
  );
}

/**
 * The mark beside every panel title.
 *
 * ONE PIECE, ONE COLOUR (owner). Four parts - a ring, a half-circle outside it,
 * two blocks standing proud at top and bottom, and a centre dot - all in the
 * same amber at full opacity. No second hue, no dimmed layer, no per-part
 * differentiation: it reads as a single solid object, which is what a mark is.
 * Earlier versions shaded the ring back and tinted the centre, and every one of
 * those decisions made it look like several things stacked up.
 *
 * BUILT GEOMETRICALLY, not stroked (owner). Each part is a filled path - the
 * rings are annuli with an even-odd hole rather than a stroked circle - so the
 * shape is exact at any size and nothing depends on how a renderer resolves a
 * half-pixel stroke at 18px, which is the size it is actually used at.
 *
 * Reconstructed from the owner's Figma (node 1-21286): the gold was sampled at
 * #FFCD48 and lands on --screen-warn, the amber this screen already uses for
 * every warm element.
 */
export function Ring() {
  return (
    <span className="mod-mark" aria-hidden>
      {/* THE viewBox IS THE INK, not a round 24. Drawn at 0 0 24 24 the shape
          only occupies 18.4 x 21.2 of it, so an eighth of the box was empty and
          the mark rendered smaller than the space it was given. Worse, the
          margin was UNEVEN - 2.0 left against 3.6 right, because the
          half-circle protrudes left and nothing protrudes right - so the mark
          sat off-centre beside its title. Cropping to the ink fixes both: it
          fills its box and its optical centre is the box's centre. */}
      <svg viewBox="0.6 1.4 21.2 21.2" fill="var(--screen-warn)">
        {/* the circle - an annulus, outer 8.4 / inner 7.5 */}
        <path
          fillRule="evenodd"
          d="M12 3.6a8.4 8.4 0 1 0 0 16.8a8.4 8.4 0 1 0 0-16.8Z
             M12 4.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15Z"
        />
        {/* the half-circle, OUTSIDE the ring: 8.4 to 10, spanning 140 degrees
            about west so it stops 20 short of each block */}
        <path d="M8.58 2.603A10 10 0 0 0 8.58 21.397L9.127 19.893A8.4 8.4 0 0 1 9.127 4.107Z" />
        {/* the two blocks, crossing the ring and standing proud */}
        <rect x="11.2" y="1.4" width="1.6" height="3.4" rx=".2" />
        <rect x="11.2" y="19.2" width="1.6" height="3.4" rx=".2" />
        <circle cx="12" cy="12" r="1.9" />
      </svg>
    </span>
  );
}

/**
 * The title's centre dot.
 *
 * AN SVG, NOT THE CHARACTER "·", and the reason is the wobble it replaces. A
 * middle dot sits high and off-centre inside its em box, so `scale()` - which
 * pivots on that BOX, not on the ink - moved the visible dot up and down as it
 * grew. It read as jumping rather than breathing, and no amount of
 * vertical-align fixes it, because the mismatch is between the glyph's centre
 * and its box's.
 *
 * A circle's centre is exactly where it is put, so this one does not move at
 * all: THE CORE NEVER CHANGES SIZE OR POSITION. The breathing is carried
 * entirely by a ring expanding outward from behind it and by the glow around
 * it - which is what "呼吸 + 眩晕" actually looks like, and is steadier than
 * pulsing the mark itself.
 *
 * Same 3.4s rhythm as the six panel marks: one heartbeat across the screen.
 */
export function TitleDot() {
  return (
    <span className="dot" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none">
        <circle className="dot-halo" cx="12" cy="12" r="6" stroke={CYAN} strokeWidth="1.5" />
        <circle className="dot-core" cx="12" cy="12" r="3.4" fill={CYAN_B} />
      </svg>
    </span>
  );
}
